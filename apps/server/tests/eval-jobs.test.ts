import { describe, it, expect, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository, IProjectRepository, IScoreRepository,
  IDatasetRepository, IPromptRepository, IStatsRepository,
  IUserRepository, IAlertRepository, IAuditRepository,
  IProviderRepository, IEvaluatorRepository, IEvalJobRepository,
  TraceListItem, TraceDetail, ProjectListItem, AuditLog,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';
import type { EvalWorker } from '../src/modules/eval-worker.js';

const eventBusEmitMock = vi.fn();
vi.mock('../src/modules/event-bus.js', () => {
  const { EventEmitter } = require('node:events');
  const bus = new EventEmitter();
  bus.setMaxListeners(200);
  bus.emit = (...args: unknown[]) => eventBusEmitMock(...args);
  return { eventBus: bus };
});

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
  const datasetItems = [
    { id: 'di_1', input: { q: '问题1' }, expectedOutput: null, createdAt: new Date() },
    { id: 'di_2', input: { q: '问题2' }, expectedOutput: null, createdAt: new Date() },
  ];
  const datasetRepo: IDatasetRepository = {
    async createDataset() { return 'd1'; }, async listDatasets() { return []; },
    async getDataset(id) { return id === 'ds_1' ? { id, projectId: PROJECT_ID, name: '测试集', description: null, createdAt: new Date() } : null; },
    async addDatasetItem() { return 'i1'; },
    async listDatasetItems(id) { return id === 'ds_1' ? datasetItems : []; },
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
    async create() { throw new Error(); }, async list() { return []; },
    async getWithKey() { return null; }, async get() { return null; },
    async update() { return null; }, async delete() {},
  };
  const evaluatorRepo: IEvaluatorRepository = {
    async create() { throw new Error(); }, async listByProject() { return []; },
    async get() { return null; }, async update() { return null; }, async delete() {},
  };

  const jobStore = new Map<string, any>();
  const itemStore = new Map<string, string[]>();
  const evalJobRepo: IEvalJobRepository = {
    async createJob(data) {
      const id = `job_${jobStore.size + 1}`;
      const now = new Date();
      const job = {
        id, projectId: data.projectId, name: data.name,
        datasetId: data.datasetId, promptId: data.promptId, promptVersion: data.promptVersion,
        providerId: data.providerId, model: data.model, evaluatorIds: data.evaluatorIds,
        status: 'pending' as const, concurrency: data.concurrency ?? 3, totalItems: data.totalItems,
        completedItems: 0, failedItems: 0, summary: null, errorMessage: null,
        startedAt: null, completedAt: null, createdAt: now,
      };
      jobStore.set(id, job);
      return job;
    },
    async createItems(jobId, datasetItemIds) { itemStore.set(jobId, datasetItemIds); },
    async listJobs(projectId) {
      return { jobs: Array.from(jobStore.values()).filter(j => j.projectId === projectId), nextCursor: null };
    },
    async getJob(id) { return jobStore.get(id) ?? null; },
    async updateJobStatus(id, status) {
      const j = jobStore.get(id);
      if (j) jobStore.set(id, { ...j, status });
      return jobStore.get(id) ?? null;
    },
    async incrementJobCounter() {},
    async setJobSummary() {},
    async listItems(jobId) { return { items: [], nextCursor: null }; },
    async countItemsByStatus() { return { pending: 0, running: 0, success: 0, failed: 0 }; },
    async interruptRunning() { return 0; },
    async listPendingItems() { return []; },
    async getItem() { return null; },
    async updateItemStatus() { return null; },
  };

  const cancelMock = vi.fn();
  const evalWorker = { cancelJob: cancelMock } as unknown as EvalWorker;

  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, auditRepo, alertEvaluator, providerRepo, evaluatorRepo, evalJobRepo, evalWorker, jobStore, itemStore, cancelMock };
}

describe('Eval Job API', () => {
  it('POST /api/eval/jobs 创建任务时自动创建 items 并发出 job-started', async () => {
    const deps = makeMockDeps();
    eventBusEmitMock.mockClear();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const res = await app.inject({
        method: 'POST', url: '/api/eval/jobs',
        headers: h,
        payload: {
          projectId: PROJECT_ID, name: '首次评估', datasetId: 'ds_1',
          promptId: 'pr_1', promptVersion: 1, providerId: 'pv_1',
          model: 'gpt-4o-mini', evaluatorIds: ['ev_1'],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe('pending');
      expect(body.totalItems).toBe(2);
      expect(deps.itemStore.get(body.id)).toEqual(['di_1', 'di_2']);
      expect(eventBusEmitMock).toHaveBeenCalledWith('eval:job-started', expect.objectContaining({ jobId: body.id }));
    } finally {
      await app.close();
    }
  });

  it('数据集不存在时返回 404', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const res = await app.inject({
        method: 'POST', url: '/api/eval/jobs',
        headers: h,
        payload: {
          projectId: PROJECT_ID, name: 'x', datasetId: 'missing',
          promptId: 'p', promptVersion: 1, providerId: 'pv',
          model: 'm', evaluatorIds: ['ev'],
        },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('GET /api/eval/jobs 列表按 projectId 过滤', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      await app.inject({
        method: 'POST', url: '/api/eval/jobs', headers: h,
        payload: {
          projectId: PROJECT_ID, name: 'j1', datasetId: 'ds_1',
          promptId: 'p', promptVersion: 1, providerId: 'pv',
          model: 'm', evaluatorIds: ['ev'],
        },
      });
      const list = await app.inject({ method: 'GET', url: `/api/eval/jobs?projectId=${PROJECT_ID}`, headers: h });
      expect(list.statusCode).toBe(200);
      expect(list.json().jobs).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('GET /api/eval/jobs/:id 详情返回完整 job', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const created = await app.inject({
        method: 'POST', url: '/api/eval/jobs', headers: h,
        payload: {
          projectId: PROJECT_ID, name: 'j1', datasetId: 'ds_1',
          promptId: 'p', promptVersion: 1, providerId: 'pv',
          model: 'm', evaluatorIds: ['ev'],
        },
      });
      const id = created.json().id;
      const detail = await app.inject({ method: 'GET', url: `/api/eval/jobs/${id}`, headers: h });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().id).toBe(id);
    } finally {
      await app.close();
    }
  });

  it('POST /api/eval/jobs/:id/cancel 调用 worker.cancelJob', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const created = await app.inject({
        method: 'POST', url: '/api/eval/jobs', headers: h,
        payload: {
          projectId: PROJECT_ID, name: 'j1', datasetId: 'ds_1',
          promptId: 'p', promptVersion: 1, providerId: 'pv',
          model: 'm', evaluatorIds: ['ev'],
        },
      });
      const id = created.json().id;
      const cancel = await app.inject({ method: 'POST', url: `/api/eval/jobs/${id}/cancel`, headers: h });
      expect(cancel.statusCode).toBe(200);
      expect(deps.cancelMock).toHaveBeenCalledWith(id);
    } finally {
      await app.close();
    }
  });

  it('cancel 终态任务返回 409', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const created = await app.inject({
        method: 'POST', url: '/api/eval/jobs', headers: h,
        payload: {
          projectId: PROJECT_ID, name: 'j1', datasetId: 'ds_1',
          promptId: 'p', promptVersion: 1, providerId: 'pv',
          model: 'm', evaluatorIds: ['ev'],
        },
      });
      const id = created.json().id;
      deps.jobStore.get(id).status = 'completed';
      const cancel = await app.inject({ method: 'POST', url: `/api/eval/jobs/${id}/cancel`, headers: h });
      expect(cancel.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });

  it('evaluatorIds 为空数组应返回 400', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    try {
      const h = await authHeaders();
      const res = await app.inject({
        method: 'POST', url: '/api/eval/jobs', headers: h,
        payload: {
          projectId: PROJECT_ID, name: 'j1', datasetId: 'ds_1',
          promptId: 'p', promptVersion: 1, providerId: 'pv',
          model: 'm', evaluatorIds: [],
        },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
