import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository, IProjectRepository, IScoreRepository,
  IDatasetRepository, IPromptRepository, IStatsRepository,
  IUserRepository, IAlertRepository, IAuditRepository,
  TraceListItem, TraceDetail, ProjectListItem,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';

process.env.JWT_SECRET = 'test-secret';
import { signToken } from '../src/auth/jwt.js';

async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
}

function makeMockTraceRepo(stored: TraceListItem[]): ITraceRepository {
  return {
    async listTraces(projectId, limit, cursor?): Promise<TraceListItem[]> {
      let items = stored;
      if (cursor) {
        items = stored.filter(t => t.timestamp.getTime() < new Date(cursor).getTime());
      }
      return items.slice(0, limit);
    },
    async getTraceDetail(): Promise<TraceDetail | null> { return null; },
    async createTraceWithObservations() {},
  };
}

function makeMockDeps(traceRepo: ITraceRepository) {
  const projectRepo: IProjectRepository = {
    async findByApiKey() { return null; },
    async listAll() { return [{ id: 'p1', name: 'demo', apiKeyPreview: 'abcd', createdAt: new Date() } as ProjectListItem]; },
    async exists() { return true; },
  };
  const scoreRepo: IScoreRepository = { async createScore() { return 's1'; }, async listScoresByTrace() { return []; } };
  const datasetRepo: IDatasetRepository = {
    async createDataset() { return 'd1'; }, async listDatasets() { return []; },
    async getDataset() { return null; }, async addDatasetItem() { return 'i1'; }, async listDatasetItems() { return []; },
  };
  const promptRepo: IPromptRepository = {
    async createPrompt() { return { promptId: 'p1', version: 1 }; }, async listPrompts() { return []; },
    async getPrompt() { return null; }, async getPromptByName() { return null; },
    async addVersion() { return 2; }, async listVersions() { return []; },
  };
  const statsRepo: IStatsRepository = {
    async getOverview() {
      return { range: '24h', series: [], summary: { totalTraces: 0, totalTokens: 0, totalCost: '0', avgLatencyMs: null }, topModels: [], scoreDistribution: [] };
    },
  };
  const userRepo: IUserRepository = {
    async findByEmail() { return null; },
    async create(email, passwordHash) { return { id: 'u1', email, passwordHash, role: 'admin', createdAt: new Date(), updatedAt: new Date() }; },
  };
  const alertRepo: IAlertRepository = {
    async listRules() { return []; }, async getRule() { return null; },
    async createRule() { throw new Error('not implemented'); }, async updateRule() { return null; },
    async deleteRule() {}, async listEvents() { return []; }, async createEvent() {},
  };
  const auditRepo: IAuditRepository = {
    async log(entry) { return { ...entry, id: 'a1', createdAt: new Date() } as any; },
    async list() { return { logs: [], nextCursor: null }; },
  };
  const alertEvaluator = { evaluate: async () => {}, testWebhook: async () => false } as unknown as AlertEvaluator;
  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, auditRepo, alertEvaluator };
}

function makeTrace(id: string, minutesAgo: number): TraceListItem {
  return {
    id,
    name: `trace-${id}`,
    userId: null,
    sessionId: null,
    timestamp: new Date(Date.now() - minutesAgo * 60_000),
  };
}

describe('Traces cursor 分页', () => {
  const VALID_PROJECT_ID = '00000000-0000-0000-0000-000000000000';

  it('第一页返回 nextCursor', async () => {
    const stored = [makeTrace('t1', 1), makeTrace('t2', 2), makeTrace('t3', 3), makeTrace('t4', 4)];
    const traceRepo = makeMockTraceRepo(stored);
    const app: FastifyInstance = await buildApp(makeMockDeps(traceRepo));
    const res = await app.inject({
      method: 'GET',
      url: `/api/traces?projectId=${VALID_PROJECT_ID}&limit=2`,
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.traces).toHaveLength(2);
    expect(body.traces[0].id).toBe('t1');
    expect(body.traces[1].id).toBe('t2');
    expect(body.nextCursor).not.toBeNull();
    expect(body.nextCursor).toBe(body.traces[1].timestamp);
  });

  it('用 nextCursor 取下一页', async () => {
    const stored = [makeTrace('t1', 1), makeTrace('t2', 2), makeTrace('t3', 3), makeTrace('t4', 4)];
    const traceRepo = makeMockTraceRepo(stored);
    const app: FastifyInstance = await buildApp(makeMockDeps(traceRepo));
    const first = await app.inject({
      method: 'GET',
      url: `/api/traces?projectId=${VALID_PROJECT_ID}&limit=2`,
      headers: await authHeaders(),
    });
    const firstBody = first.json();
    const second = await app.inject({
      method: 'GET',
      url: `/api/traces?projectId=${VALID_PROJECT_ID}&limit=2&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
      headers: await authHeaders(),
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json();
    expect(secondBody.traces).toHaveLength(2);
    expect(secondBody.traces[0].id).toBe('t3');
    expect(secondBody.traces[1].id).toBe('t4');
    expect(secondBody.nextCursor).toBeNull();
  });

  it('无数据 nextCursor=null', async () => {
    const traceRepo = makeMockTraceRepo([]);
    const app: FastifyInstance = await buildApp(makeMockDeps(traceRepo));
    const res = await app.inject({
      method: 'GET',
      url: `/api/traces?projectId=${VALID_PROJECT_ID}`,
      headers: await authHeaders(),
    });
    const body = res.json();
    expect(body.traces).toHaveLength(0);
    expect(body.nextCursor).toBeNull();
  });
});
