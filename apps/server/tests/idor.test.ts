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

process.env.JWT_SECRET = 'test-secret';

import { signToken } from '../src/auth/jwt.js';

async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
}

const VALID_PROJECT_ID = '00000000-0000-0000-0000-000000000000';

function makeMockDeps(existsReturn: boolean) {
  const traceRepo: ITraceRepository = {
    async listTraces(): Promise<TraceListItem[]> { return []; },
    async getTraceDetail(): Promise<TraceDetail | null> { return null; },
    async createTraceWithObservations() {},
  };
  const mockProject: ProjectListItem = {
    id: VALID_PROJECT_ID,
    name: 'demo',
    apiKeyPreview: 'abcd',
    createdAt: new Date('2026-01-01'),
  };
  const projectRepo: IProjectRepository = {
    async findByApiKey() { return null; },
    async listAll() { return [mockProject]; },
    async exists() { return existsReturn; },
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

describe('IDOR preHandler', () => {
  it('projectId 存在时返回 200', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps(true));
    const res = await app.inject({
      method: 'GET',
      url: `/api/traces?projectId=${VALID_PROJECT_ID}`,
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });

  it('projectId 不存在时返回 404', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps(false));
    const res = await app.inject({
      method: 'GET',
      url: '/api/traces?projectId=11111111-1111-1111-1111-111111111111',
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('不带 projectId 的路由不受影响', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps(false));
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });
});
