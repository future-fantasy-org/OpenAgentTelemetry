import { describe, it, expect, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository, IProjectRepository, IScoreRepository,
  IDatasetRepository, IPromptRepository, IStatsRepository,
  IUserRepository, IAlertRepository, IAuditRepository,
  IProviderRepository,
  TraceListItem, TraceDetail, ProjectListItem, AuditLog,
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
  const auditRepo: IAuditRepository = {
    async log(entry) { return { ...entry, id: 'a1', createdAt: new Date() } as any; },
    async list() { return { logs: [], nextCursor: null }; },
  };
  const alertEvaluator = { evaluate: async () => {}, testWebhook: async () => false } as unknown as AlertEvaluator;

  const store = new Map<string, any>();
  const providerRepo: IProviderRepository = {
    async create(data) {
      const id = `pv_${store.size + 1}`;
      const now = new Date();
      const row = {
        id, name: data.name, provider: data.provider, baseURL: data.baseURL,
        apiKeyPreview: data.apiKey.length <= 4 ? '****' : `****${data.apiKey.slice(-4)}`,
        defaultModel: data.defaultModel ?? null, createdAt: now, updatedAt: now,
        _apiKey: data.apiKey,
      };
      store.set(id, row);
      const { _apiKey, ...rest } = row;
      return rest;
    },
    async list() {
      return Array.from(store.values()).map(({ _apiKey, ...rest }) => rest);
    },
    async getWithKey(id) {
      const row = store.get(id);
      if (!row) return null;
      const { _apiKey, ...rest } = row;
      return { ...rest, apiKey: _apiKey };
    },
    async get(id) {
      const row = store.get(id);
      if (!row) return null;
      const { _apiKey, ...rest } = row;
      return rest;
    },
    async update(id, patch) {
      const row = store.get(id);
      if (!row) return null;
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.baseURL !== undefined) row.baseURL = patch.baseURL;
      if (patch.defaultModel !== undefined) row.defaultModel = patch.defaultModel;
      if (patch.apiKey !== undefined) {
        row._apiKey = patch.apiKey;
        row.apiKeyPreview = patch.apiKey.length <= 4 ? '****' : `****${patch.apiKey.slice(-4)}`;
      }
      row.updatedAt = new Date();
      const { _apiKey, ...rest } = row;
      return rest;
    },
    async delete(id) { store.delete(id); },
  };

  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, auditRepo, alertEvaluator, providerRepo };
}

describe('Eval Provider API', () => {
  it('创建 Provider 后列表不应返回 apiKey', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const created = await app.inject({
        method: 'POST', url: '/api/eval/providers',
        headers: h,
        payload: { name: 'OpenAI主账号', provider: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-test-key-5678' },
      });
      expect(created.statusCode).toBe(201);
      const body = created.json();
      expect(body.name).toBe('OpenAI主账号');
      expect(body.apiKeyPreview).toBe('****5678');
      expect(body.apiKey).toBeUndefined();
      expect(body.id).toBeDefined();

      const list = await app.inject({ method: 'GET', url: '/api/eval/providers', headers: h });
      expect(list.statusCode).toBe(200);
      const listBody = list.json();
      expect(listBody.providers).toHaveLength(1);
      expect(listBody.providers[0].apiKey).toBeUndefined();
      expect(listBody.providers[0].apiKeyPreview).toBe('****5678');
    } finally {
      await app.close();
    }
  });

  it('更新 Provider 名称和 apiKey 后 preview 应变化', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const created = await app.inject({
        method: 'POST', url: '/api/eval/providers',
        headers: h,
        payload: { name: 'Test', provider: 'custom', baseURL: 'https://api.example.com/v1', apiKey: 'sk-old-aaaa' },
      });
      const id = created.json().id;

      const updated = await app.inject({
        method: 'PUT', url: `/api/eval/providers/${id}`,
        headers: h,
        payload: { name: 'Test改', apiKey: 'sk-new-bbbb' },
      });
      expect(updated.statusCode).toBe(200);
      const body = updated.json();
      expect(body.name).toBe('Test改');
      expect(body.apiKeyPreview).toBe('****bbbb');
    } finally {
      await app.close();
    }
  });

  it('删除 Provider 后列表为空', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const created = await app.inject({
        method: 'POST', url: '/api/eval/providers',
        headers: h,
        payload: { name: 'Del', provider: 'ollama', baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' },
      });
      const id = created.json().id;

      const del = await app.inject({ method: 'DELETE', url: `/api/eval/providers/${id}`, headers: h });
      expect(del.statusCode).toBe(204);

      const list = await app.inject({ method: 'GET', url: '/api/eval/providers', headers: h });
      expect(list.json().providers).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('provider 字段不合法应返回 400', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const res = await app.inject({
        method: 'POST', url: '/api/eval/providers',
        headers: h,
        payload: { name: 'Bad', provider: 'anthropic', baseURL: 'https://api.anthropic.com', apiKey: 'k' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('baseURL 不是合法 URL 应返回 400', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const res = await app.inject({
        method: 'POST', url: '/api/eval/providers',
        headers: h,
        payload: { name: 'Bad', provider: 'openai', baseURL: 'not-a-url', apiKey: 'k' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('更新不存在的 Provider 应返回 404', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const res = await app.inject({
        method: 'PUT', url: '/api/eval/providers/non-existent',
        headers: h,
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
