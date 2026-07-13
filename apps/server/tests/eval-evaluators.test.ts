import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository, IProjectRepository, IScoreRepository,
  IDatasetRepository, IPromptRepository, IStatsRepository,
  IUserRepository, IAlertRepository, IAuditRepository,
  IProviderRepository, IEvaluatorRepository,
  TraceListItem, TraceDetail, ProjectListItem, AuditLog,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';

process.env.JWT_SECRET = 'test-secret';
import { signToken } from '../src/auth/jwt.js';

async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
}

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';

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
  const auditRepo: IAuditRepository = {
    async log(entry) { return { ...entry, id: 'a1', createdAt: new Date() } as any; },
    async list() { return { logs: [], nextCursor: null }; },
  };
  const alertEvaluator = { evaluate: async () => {}, testWebhook: async () => false } as unknown as AlertEvaluator;
  const providerRepo: IProviderRepository = {
    async create() { throw new Error('not used'); }, async list() { return []; },
    async getWithKey() { return null; }, async get() { return null; },
    async update() { return null; }, async delete() {},
  };

  const store = new Map<string, any>();
  const evaluatorRepo: IEvaluatorRepository = {
    async create(data) {
      const id = `ev_${store.size + 1}`;
      const now = new Date();
      const row = { id, ...data, createdAt: now, updatedAt: now };
      store.set(id, row);
      return row;
    },
    async listByProject(projectId) {
      return Array.from(store.values()).filter(e => e.projectId === projectId);
    },
    async get(id) { return store.get(id) ?? null; },
    async update(id, patch) {
      const row = store.get(id);
      if (!row) return null;
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.config !== undefined) row.config = patch.config;
      row.updatedAt = new Date();
      return row;
    },
    async delete(id) { store.delete(id); },
  };

  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, auditRepo, alertEvaluator, providerRepo, evaluatorRepo };
}

describe('Eval Evaluator API', () => {
  it('创建 llm_judge 评估器并按项目列表', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const created = await app.inject({
        method: 'POST', url: '/api/eval/evaluators',
        headers: h,
        payload: {
          projectId: PROJECT_ID,
          name: 'helpfulness',
          type: 'llm_judge',
          config: { providerId: 'pv_1', model: 'gpt-4o', judgePrompt: '给一个 0-1 的分', min: 0, max: 1 },
        },
      });
      expect(created.statusCode).toBe(201);
      const body = created.json();
      expect(body.name).toBe('helpfulness');
      expect(body.type).toBe('llm_judge');
      expect(body.config.model).toBe('gpt-4o');
      expect(body.id).toBeDefined();

      const list = await app.inject({ method: 'GET', url: `/api/eval/evaluators?projectId=${PROJECT_ID}`, headers: h });
      expect(list.statusCode).toBe(200);
      expect(list.json().evaluators).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('创建 numeric_threshold 评估器', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const created = await app.inject({
        method: 'POST', url: '/api/eval/evaluators',
        headers: h,
        payload: {
          projectId: PROJECT_ID,
          name: 'latency_check',
          type: 'numeric_threshold',
          config: { metric: 'latency_ms', operator: 'lte', threshold: 2000, passScore: 1, failScore: 0 },
        },
      });
      expect(created.statusCode).toBe(201);
      const body = created.json();
      expect(body.type).toBe('numeric_threshold');
      expect(body.config.metric).toBe('latency_ms');
      expect(body.config.threshold).toBe(2000);
    } finally {
      await app.close();
    }
  });

  it('更新评估器名称和 config', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const created = await app.inject({
        method: 'POST', url: '/api/eval/evaluators',
        headers: h,
        payload: {
          projectId: PROJECT_ID, name: 'old', type: 'numeric_threshold',
          config: { metric: 'latency_ms', operator: 'lte', threshold: 1000, passScore: 1, failScore: 0 },
        },
      });
      const id = created.json().id;

      const updated = await app.inject({
        method: 'PUT', url: `/api/eval/evaluators/${id}`,
        headers: h,
        payload: { name: 'new', config: { metric: 'latency_ms', operator: 'lte', threshold: 3000, passScore: 1, failScore: 0 } },
      });
      expect(updated.statusCode).toBe(200);
      const body = updated.json();
      expect(body.name).toBe('new');
      expect(body.config.threshold).toBe(3000);
    } finally {
      await app.close();
    }
  });

  it('删除评估器', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const created = await app.inject({
        method: 'POST', url: '/api/eval/evaluators',
        headers: h,
        payload: {
          projectId: PROJECT_ID, name: 'del', type: 'numeric_threshold',
          config: { metric: 'latency_ms', operator: 'lte', threshold: 1000, passScore: 1, failScore: 0 },
        },
      });
      const id = created.json().id;

      const del = await app.inject({ method: 'DELETE', url: `/api/eval/evaluators/${id}`, headers: h });
      expect(del.statusCode).toBe(204);

      const list = await app.inject({ method: 'GET', url: `/api/eval/evaluators?projectId=${PROJECT_ID}`, headers: h });
      expect(list.json().evaluators).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('无效 type 应返回 400', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const res = await app.inject({
        method: 'POST', url: '/api/eval/evaluators',
        headers: h,
        payload: { projectId: PROJECT_ID, name: 'bad', type: 'human', config: {} },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('无效 metric 应返回 400', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const res = await app.inject({
        method: 'POST', url: '/api/eval/evaluators',
        headers: h,
        payload: {
          projectId: PROJECT_ID, name: 'bad', type: 'numeric_threshold',
          config: { metric: 'unknown_metric', operator: 'lte', threshold: 100, passScore: 1, failScore: 0 },
        },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
