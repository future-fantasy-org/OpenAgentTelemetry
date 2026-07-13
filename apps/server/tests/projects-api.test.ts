import { describe, it, expect } from 'vitest';
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
  ProjectListItem,
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

const mockProject: ProjectListItem = {
  id: 'p1',
  name: 'demo',
  apiKey: 'demo-key',
  createdAt: new Date('2026-01-01'),
};

// 内存 mock：projectRepo.listAll 返回 mockProject，其余给最小桩
function makeMockDeps() {
  const traceRepo: ITraceRepository = {
    async listTraces(): Promise<TraceListItem[]> { return []; },
    async getTraceDetail(): Promise<TraceDetail | null> { return null; },
    async createTraceWithObservations() {},
  };
  const projectRepo: IProjectRepository = {
    async findByApiKey() { return null; },
    async listAll() { return [mockProject]; },
  };
  const scoreRepo: IScoreRepository = {
    async createScore() { return 's1'; },
    async listScoresByTrace() { return []; },
  };
  const datasetRepo: IDatasetRepository = {
    async createDataset() { return 'd1'; },
    async listDatasets() { return []; },
    async getDataset() { return null; },
    async addDatasetItem() { return 'i1'; },
    async listDatasetItems() { return []; },
  };
  const promptRepo: IPromptRepository = {
    async createPrompt() { return { promptId: 'p1', version: 1 }; },
    async listPrompts() { return []; },
    async getPrompt() { return null; },
    async getPromptByName() { return null; },
    async addVersion() { return 2; },
    async listVersions() { return []; },
  };
  const statsRepo: IStatsRepository = {
    async getOverview() {
      return {
        range: '24h', series: [],
        summary: { totalTraces: 0, totalTokens: 0, totalCost: '0', avgLatencyMs: null },
        topModels: [], scoreDistribution: [],
      };
    },
  };
  const userRepo: IUserRepository = {
    async findByEmail() { return null; },
    async create(email, passwordHash) {
      return { id: 'u1', email, passwordHash, role: 'admin', createdAt: new Date(), updatedAt: new Date() };
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
  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, alertEvaluator };
}

describe('GET /api/projects', () => {
  let app: FastifyInstance;

  it('returns 401 without session cookie', async () => {
    app = await buildApp(makeMockDeps());
    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(res.statusCode).toBe(401);
  });

  it('returns project list with apiKey when authenticated', async () => {
    app = await buildApp(makeMockDeps());
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]).toMatchObject({
      id: 'p1',
      name: 'demo',
      apiKey: 'demo-key',
    });
  });
});
