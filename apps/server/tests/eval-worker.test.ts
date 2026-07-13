import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  IEvalJobRepository, JobRow, JobItemRow,
} from '../src/repositories/eval-job-repository.js';
import type { IEvaluatorRepository, EvaluatorRow } from '../src/repositories/evaluator-repository.js';
import type { IProviderRepository } from '../src/repositories/provider-repository.js';
import type { IDatasetRepository, DatasetDetail, DatasetRow } from '../src/repositories/dataset-repository.js';
import type { ITraceRepository } from '../src/repositories/trace-repository.js';
import type { IScoreRepository } from '../src/repositories/score-repository.js';
import type { IPromptRepository, PromptDetail, PromptVersion } from '../src/repositories/prompt-repository.js';

const chatCompleteMock = vi.fn();
vi.mock('../src/modules/llm-client.js', () => ({
  chatComplete: (...args: unknown[]) => chatCompleteMock(...args),
}));

const eventBusEmitMock = vi.fn();
vi.mock('../src/modules/event-bus.js', () => {
  const { EventEmitter } = require('node:events');
  const bus = new EventEmitter();
  bus.setMaxListeners(200);
  bus.emit = (...args: unknown[]) => eventBusEmitMock(...args);
  return { eventBus: bus };
});

const dbTransactionMock = vi.fn();
vi.mock('../src/db/client.js', () => ({
  db: { transaction: (cb: unknown) => dbTransactionMock(cb) },
  schema: {
    traces: { id: 'traces.id', timestamp: 'traces.timestamp' },
    observations: {},
  },
}));

import { EvalWorker } from '../src/modules/eval-worker.js';

function makeEvaluatorRow(overrides: Partial<EvaluatorRow> = {}): EvaluatorRow {
  return {
    id: 'ev_1', projectId: 'p1', name: 'latency_check', type: 'numeric_threshold',
    config: { metric: 'latency_ms', operator: 'lte', threshold: 2000, passScore: 1, failScore: 0 },
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 'job_1', projectId: 'p1', name: 'test-job',
    datasetId: 'ds_1', promptId: 'pr_1', promptVersion: 1,
    providerId: 'pv_1', model: 'gpt-4o-mini', evaluatorIds: ['ev_1'],
    status: 'pending', concurrency: 3,
    totalItems: 1, completedItems: 0, failedItems: 0,
    summary: null, errorMessage: null,
    startedAt: null, completedAt: null, createdAt: new Date(),
    ...overrides,
  };
}

function makeItem(overrides: Partial<JobItemRow> = {}): JobItemRow {
  return {
    id: 'it_1', jobId: 'job_1', datasetItemId: 'di_1',
    status: 'pending', output: null, traceId: null, latencyMs: null,
    errorMessage: null, startedAt: null, completedAt: null,
    ...overrides,
  };
}

function makeDeps(overrides: Record<string, Partial<Record<string, unknown>>> = {}) {
  const jobStore = new Map<string, JobRow>();
  const itemStore = new Map<string, JobItemRow>();
  const counts = { pending: 0, running: 0, success: 0, failed: 0 };

  const evalJobRepo: IEvalJobRepository = {
    async listPendingItems(_jobId: string) { return Array.from(itemStore.values()).filter(i => i.status === 'pending'); },
    async getJob(id: string) { return jobStore.get(id) ?? null; },
    async updateJobStatus(id, status, errorMessage) {
      const j = jobStore.get(id);
      if (j) jobStore.set(id, { ...j, status, errorMessage: errorMessage ?? j.errorMessage });
      return jobStore.get(id) ?? null;
    },
    async updateItemStatus(id, status, patch = {}) {
      const it = itemStore.get(id);
      if (it) itemStore.set(id, { ...it, status, ...patch });
      return itemStore.get(id) ?? null;
    },
    async incrementJobCounter(id, field) {
      const j = jobStore.get(id);
      if (j) jobStore.set(id, { ...j, [field]: j[field] + 1 });
    },
    async listItems(_jobId, _opts) { return { items: Array.from(itemStore.values()), nextCursor: null }; },
    async countItemsByStatus(_jobId) { return counts; },
    async setJobSummary(id, summary) { const j = jobStore.get(id); if (j) jobStore.set(id, { ...j, summary }); },
    async createJob() { return makeJob(); },
    async createItems() {},
    async getItem(id) { return itemStore.get(id) ?? null; },
    async interruptRunning() { return 0; },
    async listJobs() { return { jobs: [], nextCursor: null }; },
    ...overrides.evalJobRepo,
  } as IEvalJobRepository;

  const evaluators = [makeEvaluatorRow()];
  const evaluatorRepo: IEvaluatorRepository = {
    async listByProject() { return evaluators; },
    async create() { throw new Error(); }, async get() { return null; },
    async update() { return null; }, async delete() {},
    ...overrides.evaluatorRepo,
  } as IEvaluatorRepository;

  const providerRepo: IProviderRepository = {
    async getWithKey() { return { id: 'pv_1', name: 'p', provider: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-test', apiKeyPreview: '****test', defaultModel: 'gpt-4o-mini', createdAt: new Date(), updatedAt: new Date() }; },
    async create() { throw new Error(); }, async list() { return []; },
    async get() { return null; }, async update() { return null; }, async delete() {},
    ...overrides.providerRepo,
  } as IProviderRepository;

  const datasetDetail: DatasetDetail = { id: 'ds_1', projectId: 'p1', name: 'data', description: null, createdAt: new Date() };
  const datasetItems: DatasetRow[] = [{ id: 'di_1', input: { question: '你好' }, expectedOutput: null, createdAt: new Date() }];
  const datasetRepo: IDatasetRepository = {
    async getDataset() { return datasetDetail; },
    async listDatasetItems() { return datasetItems; },
    async createDataset() { return ''; }, async listDatasets() { return []; }, async addDatasetItem() { return ''; },
    ...overrides.datasetRepo,
  } as IDatasetRepository;

  const promptDetail: PromptDetail = { id: 'pr_1', projectId: 'p1', name: 'test-prompt', description: null, createdAt: new Date(), updatedAt: new Date() };
  const promptVersions: PromptVersion[] = [{ id: 'pv1', version: 1, template: '回答：{{question}}', config: null, labels: ['latest'], isActive: true, createdAt: new Date() }];
  const promptRepo: IPromptRepository = {
    async getPrompt() { return promptDetail; },
    async listVersions() { return promptVersions; },
    async createPrompt() { return { promptId: '', version: 1 }; }, async listPrompts() { return []; },
    async getPromptByName() { return null; }, async addVersion() { return 1; },
    ...overrides.promptRepo,
  } as IPromptRepository;

  const traceRepo: ITraceRepository = {
    async listTraces() { return []; }, async getTraceDetail() { return null; },
    async createTraceWithObservations() {},
    ...overrides.traceRepo,
  } as ITraceRepository;

  const scoreRepo: IScoreRepository = {
    async createScore() { return 's1'; }, async listScoresByTrace() { return []; },
    ...overrides.scoreRepo,
  } as IScoreRepository;

  return { evalJobRepo, evaluatorRepo, providerRepo, datasetRepo, traceRepo, scoreRepo, promptRepo, jobStore, itemStore, counts, evaluators };
}

describe('EvalWorker', () => {
  beforeEach(() => {
    chatCompleteMock.mockReset();
    eventBusEmitMock.mockReset();
    dbTransactionMock.mockReset();
  });

  it('cancelJob 应把 jobId 加入 cancelledJobs 并通知 job-completed', async () => {
    const deps = makeDeps();
    const worker = new EvalWorker(deps);
    deps.jobStore.set('job_1', makeJob());
    worker.cancelJob('job_1');
    expect(eventBusEmitMock).toHaveBeenCalledWith('eval:job-completed', expect.objectContaining({ jobId: 'job_1', status: 'cancelled' }));
    expect(deps.jobStore.get('job_1')?.status).toBe('cancelled');
  });

  it('runItem 成功路径：running → success，evaluator 评分正确写入', async () => {
    const deps = makeDeps();
    deps.jobStore.set('job_1', makeJob({ status: 'running' }));
    deps.itemStore.set('it_1', makeItem());
    deps.counts.pending = 0; deps.counts.running = 0; deps.counts.success = 1; deps.counts.failed = 0;

    chatCompleteMock.mockResolvedValueOnce({ content: 'LLM回答', promptTokens: 10, completionTokens: 5 });
    const txMock = {
      insert: () => {
        const chain = {
          values: () => chain,
          returning: async () => [{ id: 'tr_1' }],
          then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve),
        };
        return chain;
      },
    };
    dbTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock));

    const worker = new EvalWorker(deps);
    await (worker as unknown as { runItem: (item: JobItemRow) => Promise<void> }).runItem(makeItem());

    const item = deps.itemStore.get('it_1');
    expect(item?.status).toBe('success');
    expect(item?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(deps.jobStore.get('job_1')?.completedItems).toBe(1);
    expect(eventBusEmitMock).toHaveBeenCalledWith('eval:item-completed', expect.objectContaining({ status: 'success' }));
  });

  it('LLM 失败时 item 标记 failed, failedItems++', async () => {
    const deps = makeDeps();
    deps.jobStore.set('job_1', makeJob({ status: 'running' }));
    deps.itemStore.set('it_1', makeItem());
    deps.counts.pending = 0; deps.counts.running = 0; deps.counts.success = 0; deps.counts.failed = 1;

    chatCompleteMock.mockRejectedValueOnce(new Error('LLM timeout'));

    const worker = new EvalWorker(deps);
    await (worker as unknown as { runItem: (item: JobItemRow) => Promise<void> }).runItem(makeItem());

    expect(deps.itemStore.get('it_1')?.status).toBe('failed');
    expect(deps.itemStore.get('it_1')?.errorMessage).toContain('LLM timeout');
    expect(deps.jobStore.get('job_1')?.failedItems).toBe(1);
    expect(eventBusEmitMock).toHaveBeenCalledWith('eval:item-completed', expect.objectContaining({ status: 'failed' }));
  });

  it('numeric_threshold 评分：latency <= threshold 给 passScore', async () => {
    const deps = makeDeps();
    deps.evaluators[0] = makeEvaluatorRow({
      config: { metric: 'latency_ms', operator: 'lte', threshold: 100000, passScore: 1, failScore: 0 },
    });
    deps.jobStore.set('job_1', makeJob());
    deps.itemStore.set('it_1', makeItem());
    deps.counts.pending = 0; deps.counts.running = 0; deps.counts.success = 1; deps.counts.failed = 0;

    chatCompleteMock.mockResolvedValueOnce({ content: 'ok', promptTokens: 5, completionTokens: 3 });
    const txMock = {
      insert: () => {
        const chain = {
          values: () => chain,
          returning: async () => [{ id: 'tr_1' }],
          then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve),
        };
        return chain;
      },
    };
    dbTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock));

    const worker = new EvalWorker(deps);
    await (worker as unknown as { runItem: (item: JobItemRow) => Promise<void> }).runItem(makeItem());

    const item = deps.itemStore.get('it_1');
    const output = item?.output as { scores: { name: string; value: number }[] };
    expect(output.scores[0].name).toBe('latency_check');
    expect(output.scores[0].value).toBe(1);
  });

  it('maybeCompleteJob: 所有 item 完结时 job 状态置 completed 并写 summary', async () => {
    const deps = makeDeps();
    deps.jobStore.set('job_1', makeJob({ status: 'running', totalItems: 1 }));
    deps.itemStore.set('it_1', makeItem({ status: 'success', output: { scores: [{ name: 'latency_check', value: 1 }] } }));
    deps.counts.pending = 0; deps.counts.running = 0; deps.counts.success = 1; deps.counts.failed = 0;

    const worker = new EvalWorker(deps);
    await (worker as unknown as { maybeCompleteJob: (jobId: string) => Promise<void> }).maybeCompleteJob('job_1');

    const job = deps.jobStore.get('job_1');
    expect(job?.status).toBe('completed');
    expect(job?.summary).toBeDefined();
    expect((job?.summary as Record<string, unknown>)?.['latency_check']).toBeDefined();
    expect(eventBusEmitMock).toHaveBeenCalledWith('eval:job-completed', expect.objectContaining({ status: 'completed' }));
  });
});
