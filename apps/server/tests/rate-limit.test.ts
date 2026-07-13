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
  IAuditRepository,
  TraceListItem,
  TraceDetail,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';

process.env.JWT_SECRET = 'test-secret';

function makeMockDeps() {
  const traceRepo: ITraceRepository = {
    async listTraces(): Promise<TraceListItem[]> { return []; },
    async getTraceDetail(): Promise<TraceDetail | null> { return null; },
    async createTraceWithObservations() {},
  };
  const projectRepo: IProjectRepository = {
    async findByApiKey() { return { id: 'proj-1', name: 'test' }; },
    async listAll() { return []; },
    async exists() { return true; },
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
  const auditRepo: IAuditRepository = {
    async log(entry) { return { ...entry, id: 'a1', createdAt: new Date() } as any; },
    async list() { return { logs: [], nextCursor: null }; },
  };
  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, auditRepo, alertEvaluator };
}

describe('Rate limiting', () => {
  it('login 路由超 10 次/min 返回 429', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps());
    let res429 = null;
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'x@y.z', password: 'wrong' },
      });
      if (res.statusCode === 429) {
        res429 = res;
        break;
      }
    }
    expect(res429).not.toBeNull();
    expect(res429!.statusCode).toBe(429);
  });

  it('ingestion 路由超 600 次/min 返回 429', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps());
    let res429 = null;
    for (let i = 0; i < 602; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/public/ingestion',
        headers: { authorization: 'Bearer valid-key' },
        payload: { batch: [] },
      });
      if (res.statusCode === 429) {
        res429 = res;
        break;
      }
    }
    expect(res429).not.toBeNull();
    expect(res429!.statusCode).toBe(429);
  });
});
