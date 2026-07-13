import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hash } from '@node-rs/argon2';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository, IProjectRepository, IScoreRepository,
  IDatasetRepository, IPromptRepository, IStatsRepository,
  IUserRepository, IAlertRepository, IAuditRepository,
  TraceListItem, TraceDetail, ProjectListItem, NewAuditLog, AuditLog,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';

process.env.JWT_SECRET = 'test-secret';
import { signToken } from '../src/auth/jwt.js';

async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
}

function makeMockDeps() {
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
  const loggedEntries: NewAuditLog[] = [];
  const auditRepo: IAuditRepository = {
    async log(entry: NewAuditLog): Promise<AuditLog> {
      loggedEntries.push(entry);
      return { ...entry, id: 'a1', createdAt: new Date() } as AuditLog;
    },
    async list() { return { logs: [], nextCursor: null }; },
  };
  const alertEvaluator = { evaluate: async () => {}, testWebhook: async () => false } as unknown as AlertEvaluator;
  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, auditRepo, alertEvaluator, __logged: loggedEntries };
}

describe('审计 onResponse 钩子', () => {
  it('GET 成功不记录审计', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    await app.inject({ method: 'GET', url: '/api/projects', headers: await authHeaders() });
    expect(deps.__logged.length).toBe(0);
  });

  it('POST login 成功记录 auth.login.success', async () => {
    const deps = makeMockDeps();
    const passwordHash = await hash('correct-pw');
    deps.userRepo.findByEmail = async () => ({ id: 'u1', email: 'test@oat.dev', passwordHash, role: 'admin', createdAt: new Date(), updatedAt: new Date() });
    const app: FastifyInstance = await buildApp(deps);
    await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'test@oat.dev', password: 'correct-pw' },
    });
    expect(deps.__logged.length).toBe(1);
    expect(deps.__logged[0].action).toBe('auth.login.success');
  });

  it('POST login 失败记录 auth.login.failed', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'nope@oat.dev', password: 'x' },
    });
    expect(deps.__logged.length).toBe(1);
    expect(deps.__logged[0].action).toBe('auth.login.failed');
    expect(deps.__logged[0].statusCode).toBe(401);
  });

  it('GET /api/traces 404 记录 idor.blocked', async () => {
    const deps = makeMockDeps();
    deps.projectRepo.exists = async () => false;
    const app: FastifyInstance = await buildApp(deps);
    await app.inject({
      method: 'GET',
      url: '/api/traces?projectId=11111111-1111-1111-1111-111111111111',
      headers: await authHeaders(),
    });
    expect(deps.__logged.length).toBe(1);
    expect(deps.__logged[0].action).toBe('idor.blocked');
  });

  it('/health 不记录', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    await app.inject({ method: 'GET', url: '/health' });
    expect(deps.__logged.length).toBe(0);
  });
});
