import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository, IProjectRepository, IScoreRepository,
  IDatasetRepository, IPromptRepository, IStatsRepository,
  IUserRepository, IAlertRepository, IAuditRepository,
  TraceListItem, TraceDetail, ProjectListItem, AuditLog,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';

process.env.JWT_SECRET = 'test-secret';
import { signToken } from '../src/auth/jwt.js';

async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
}

function makeMockDeps(mockLogs: AuditLog[]) {
  const traceRepo: ITraceRepository = {
    async listTraces(): Promise<TraceListItem[]> { return []; },
    async getTraceDetail(): Promise<TraceDetail | null> { return null; },
    async createTraceWithObservations() {},
  };
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
    async list(params) {
      let logs = mockLogs;
      if (params.action) logs = logs.filter(l => l.action === params.action);
      if (params.projectId) logs = logs.filter(l => l.projectId === params.projectId);
      const limit = params.limit ?? 50;
      const sliced = logs.slice(0, limit);
      return {
        logs: sliced,
        nextCursor: logs.length > limit && sliced.length > 0
          ? sliced[sliced.length - 1].createdAt.toISOString()
          : null,
      };
    },
  };
  const alertEvaluator = { evaluate: async () => {}, testWebhook: async () => false } as unknown as AlertEvaluator;
  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, auditRepo, alertEvaluator };
}

const mockLog: AuditLog = {
  id: 'a1', createdAt: new Date('2026-07-13T12:00:00Z'),
  actorEmail: 'admin@oat.dev', actorIp: '127.0.0.1',
  action: 'ingestion', method: 'POST', path: '/api/public/ingestion',
  resourceType: null, resourceId: null, projectId: 'p1',
  statusCode: 200, durationMs: 5, metadata: {},
};

describe('GET /api/audit/logs', () => {
  it('未认证返回 401', async () => {
    const app = await buildApp(makeMockDeps([]));
    const res = await app.inject({ method: 'GET', url: '/api/audit/logs' });
    expect(res.statusCode).toBe(401);
  });

  it('认证后返回日志列表', async () => {
    const app = await buildApp(makeMockDeps([mockLog]));
    const res = await app.inject({
      method: 'GET', url: '/api/audit/logs',
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].action).toBe('ingestion');
    expect(body.nextCursor).toBeNull();
  });

  it('action 筛选', async () => {
    const app = await buildApp(makeMockDeps([mockLog]));
    const res = await app.inject({
      method: 'GET', url: '/api/audit/logs?action=auth.login.success',
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.logs).toHaveLength(0);
  });
});
