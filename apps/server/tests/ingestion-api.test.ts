import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository,
  IProjectRepository,
  IScoreRepository,
  IDatasetRepository,
  IPromptRepository,
  IStatsRepository,
  IUserRepository,
  IAlertRepository,
  TraceListItem,
  TraceDetail,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';

// 测试需要一个 JWT_SECRET 才能签发/校验 token（requireAuth preHandler 依赖它）
process.env.JWT_SECRET = 'test-secret';

import { signToken } from '../src/auth/jwt.js';

// 受保护路由测试用：签一个合法 token，注入到请求的 cookie 里
async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
}

// 内存 mock：记录被调用的数据，方便断言
function makeMockRepos(listReturn: TraceListItem[] = []) {
  const stored: Array<{ trace: unknown; obs: unknown[] }> = [];
  const traceRepo: ITraceRepository = {
    async listTraces() { return listReturn; },
    async getTraceDetail(): Promise<TraceDetail | null> { return null; },
    async createTraceWithObservations(trace, obs) { stored.push({ trace, obs }); },
  };
  const projectRepo: IProjectRepository = {
    async findByApiKey(key: string) {
      return key === 'valid-key' ? { id: 'proj-1', name: 'test' } : null;
    },
    async listAll() { return []; },
    async exists() { return true; },
  };
  const scoreRepo: IScoreRepository = {
    async createScore() { return 'score-1'; },
    async listScoresByTrace() { return []; },
  };
  const datasetRepo: IDatasetRepository = {
    async createDataset() { return 'ds-1'; },
    async listDatasets() { return []; },
    async getDataset() { return null; },
    async addDatasetItem() { return 'item-1'; },
    async listDatasetItems() { return []; },
  };
  const promptRepo: IPromptRepository = {
    async createPrompt() { return { promptId: 'p-1', version: 1 }; },
    async listPrompts() { return []; },
    async getPrompt() { return null; },
    async getPromptByName() { return null; },
    async addVersion() { return 2; },
    async listVersions() { return []; },
  };
  const statsRepo: IStatsRepository = {
    async getOverview() {
      return { range: '24h', series: [], summary: { totalTraces: 0, totalTokens: 0, totalCost: '0', avgLatencyMs: null }, topModels: [], scoreDistribution: [] };
    },
  };
  const userRepo: IUserRepository = {
    async findByEmail() { return null; },
    async create(email, passwordHash) {
      return { id: 'u-1', email, passwordHash, role: 'admin', createdAt: new Date(), updatedAt: new Date() };
    },
  };
  const alertRepo: IAlertRepository = {
    async listRules() { return []; },
    async getRule() { return null; },
    async createRule() { throw new Error('not implemented'); },
    async updateRule() { return null; },
    async deleteRule() {},
    async listEvents() { return []; },
    async createEvent() {},
  };
  const alertEvaluator = { evaluate: async () => {}, testWebhook: async () => false } as unknown as AlertEvaluator;
  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, alertEvaluator, stored };
}

describe('Ingestion API', () => {
  let app: FastifyInstance;
  let mocks: ReturnType<typeof makeMockRepos>;

  beforeEach(async () => {
    mocks = makeMockRepos();
    app = await buildApp(mocks);
  });

  it('缺少 API Key 返回 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/public/ingestion', payload: { batch: [] } });
    expect(res.statusCode).toBe(401);
  });

  it('无效 API Key 返回 401', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/public/ingestion',
      headers: { authorization: 'Bearer wrong' },
      payload: { batch: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('合法请求写入并返回 202', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/public/ingestion',
      headers: { authorization: 'Bearer valid-key' },
      payload: {
        batch: [
          {
            id: 'o1', traceId: 't1', parentId: null,
            type: 'span', name: 'root', startTime: '2026-07-09T00:00:00Z',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.payload).accepted).toBe(1);
    expect(mocks.stored).toHaveLength(1);
  });

  it('坏数据返回 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/public/ingestion',
      headers: { authorization: 'Bearer valid-key' },
      payload: { batch: [{ id: 'x' }] }, // 缺 traceId
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Traces 查询 API', () => {
  it('返回项目下的 trace 列表', async () => {
    const listTraceReturn: TraceListItem[] = [
      { id: 't1', name: 'trace1', userId: null, sessionId: null, timestamp: new Date() },
    ];
    const mocks = makeMockRepos(listTraceReturn);
    const app = await buildApp(mocks);

    const res = await app.inject({ method: 'GET', url: '/api/traces?projectId=00000000-0000-0000-0000-000000000000', headers: await authHeaders() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.traces).toHaveLength(1);
    expect(body.traces[0].name).toBe('trace1');
  });
});

describe('Trace 详情 API', () => {
  it('存在时返回 trace + observations', async () => {
    const detail: TraceDetail = {
      id: 't1', name: 'test', userId: null, sessionId: null,
      input: null, output: null, metadata: null, timestamp: new Date(),
      observations: [
        { id: 'o1', parentId: null, type: 'span', name: 'step1', startTime: new Date(), endTime: new Date(),
          input: null, output: null, model: null, promptTokens: null, completionTokens: null, totalCost: null, level: 'info', metadata: null },
      ],
    };
    const mocks = makeMockRepos();
    mocks.traceRepo.getTraceDetail = async () => detail;
    const app = await buildApp(mocks);

    const res = await app.inject({ method: 'GET', url: '/api/traces/t1', headers: await authHeaders() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.observations).toHaveLength(1);
    expect(body.observations[0].name).toBe('step1');
  });

  it('不存在时返回 404', async () => {
    const mocks = makeMockRepos();
    const app = await buildApp(mocks);
    const res = await app.inject({ method: 'GET', url: '/api/traces/nonexistent', headers: await authHeaders() });
    expect(res.statusCode).toBe(404);
  });
});

describe('Auth 鉴权', () => {
  it('受保护路由不带 cookie 返回 401', async () => {
    const mocks = makeMockRepos();
    const app = await buildApp(mocks);
    const res = await app.inject({ method: 'GET', url: '/api/traces?projectId=x' });
    expect(res.statusCode).toBe(401);
  });

  it('受保护路由带合法 cookie 返回 200', async () => {
    const mocks = makeMockRepos([]);
    const app = await buildApp(mocks);
    const res = await app.inject({ method: 'GET', url: '/api/traces?projectId=00000000-0000-0000-0000-000000000000', headers: await authHeaders() });
    expect(res.statusCode).toBe(200);
  });

  it('/api/public/ingestion 不受 cookie 鉴权影响（走 Bearer）', async () => {
    const mocks = makeMockRepos();
    const app = await buildApp(mocks);
    // 不带任何 cookie，只带 Bearer key，应该能通过
    const res = await app.inject({
      method: 'POST', url: '/api/public/ingestion',
      headers: { authorization: 'Bearer valid-key' },
      payload: {
        batch: [
          { id: 'o1', traceId: 't1', parentId: null, type: 'span', name: 'root', startTime: '2026-07-09T00:00:00Z' },
        ],
      },
    });
    expect(res.statusCode).toBe(202);
  });
});
