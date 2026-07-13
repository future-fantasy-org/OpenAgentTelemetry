import { db, schema } from '../db/client.js';
import { eventBus } from './event-bus.js';
import { chatComplete } from './llm-client.js';
import type { IEvalJobRepository, JobItemRow, JobRow } from '../repositories/eval-job-repository.js';
import type { IEvaluatorRepository, EvaluatorRow, LlmJudgeConfig, NumericThresholdConfig } from '../repositories/evaluator-repository.js';
import type { IProviderRepository } from '../repositories/provider-repository.js';
import type { IDatasetRepository } from '../repositories/dataset-repository.js';
import type { ITraceRepository } from '../repositories/trace-repository.js';
import type { IScoreRepository } from '../repositories/score-repository.js';
import type { IPromptRepository } from '../repositories/prompt-repository.js';

const MAX_CONCURRENCY = 3;

export type EvalWorkerDeps = {
  evalJobRepo: IEvalJobRepository;
  evaluatorRepo: IEvaluatorRepository;
  providerRepo: IProviderRepository;
  datasetRepo: IDatasetRepository;
  traceRepo: ITraceRepository;
  scoreRepo: IScoreRepository;
  promptRepo: IPromptRepository;
};

function renderTemplate(template: string, input: unknown): string {
  if (input === null || typeof input !== 'object') return template;
  let result = template;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    result = result.replaceAll(`{{${k}}}`, typeof v === 'string' ? v : JSON.stringify(v));
  }
  return result;
}

function parseJudgeScore(content: string, min: number, max: number): { score: number; raw: string } {
  const match = content.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return { score: min, raw: content };
  let score = parseFloat(match[1]);
  if (score < min) score = min;
  if (score > max) score = max;
  const range = max - min;
  if (range !== 0) score = (score - min) / range;
  return { score, raw: content };
}

async function evaluateNumericThreshold(
  cfg: NumericThresholdConfig,
  ctx: { latencyMs: number; promptTokens: number | null; completionTokens: number | null },
): Promise<{ name: string; value: number; comment: string }> {
  let actual: number;
  switch (cfg.metric) {
    case 'latency_ms': actual = ctx.latencyMs; break;
    case 'prompt_tokens': actual = ctx.promptTokens ?? 0; break;
    case 'completion_tokens': actual = ctx.completionTokens ?? 0; break;
    case 'total_cost': actual = 0; break;
  }
  const pass = cfg.operator === 'lt' ? actual < cfg.threshold
    : cfg.operator === 'lte' ? actual <= cfg.threshold
    : cfg.operator === 'gt' ? actual > cfg.threshold
    : actual >= cfg.threshold;
  return {
    name: cfg.metric,
    value: pass ? cfg.passScore : cfg.failScore,
    comment: `${cfg.metric}=${actual} ${cfg.operator} ${cfg.threshold} → ${pass ? 'pass' : 'fail'}`,
  };
}

async function evaluateLlmJudge(
  cfg: LlmJudgeConfig,
  providerRepo: IProviderRepository,
  renderedPrompt: string,
  output: string,
): Promise<{ name: string; value: number; comment: string }> {
  const judgeProvider = await providerRepo.getWithKey(cfg.providerId);
  if (!judgeProvider) {
    return { name: 'llm_judge', value: cfg.min, comment: 'judge provider 不存在' };
  }
  const userPrompt = cfg.judgePrompt
    .replaceAll('{{input}}', renderedPrompt)
    .replaceAll('{{output}}', output);
  const resp = await chatComplete(
    { baseURL: judgeProvider.baseURL, apiKey: judgeProvider.apiKey },
    cfg.model,
    [{ role: 'user', content: userPrompt }],
  );
  const { score, raw } = parseJudgeScore(resp.content, cfg.min, cfg.max);
  return { name: 'llm_judge', value: score, comment: raw.slice(0, 500) };
}

export class EvalWorker {
  private runningCount = 0;
  private queue: JobItemRow[] = [];
  private cancelledJobs = new Set<string>();
  private pumping = false;
  private deps: EvalWorkerDeps;
  private jobCache = new Map<string, JobRow>();
  private evaluatorsCache = new Map<string, EvaluatorRow[]>();

  constructor(deps: EvalWorkerDeps) {
    this.deps = deps;
    eventBus.on('eval:job-started', (e: { jobId: string }) => {
      void this.loadPendingItems(e.jobId);
    });
  }

  cancelJob(jobId: string): void {
    this.cancelledJobs.add(jobId);
    this.queue = this.queue.filter(i => i.jobId !== jobId);
    void this.deps.evalJobRepo.updateJobStatus(jobId, 'cancelled');
    eventBus.emit('eval:job-completed', { jobId, projectId: '', status: 'cancelled' });
  }

  private async loadPendingItems(jobId: string): Promise<void> {
    if (this.cancelledJobs.has(jobId)) return;
    const items = await this.deps.evalJobRepo.listPendingItems(jobId, 200);
    if (items.length === 0) return;
    const job = await this.deps.evalJobRepo.getJob(jobId);
    if (!job) return;
    if (job.status !== 'running') {
      await this.deps.evalJobRepo.updateJobStatus(jobId, 'running');
    }
    this.jobCache.set(jobId, job);
    this.queue.push(...items);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.runningCount < MAX_CONCURRENCY && this.queue.length > 0) {
        const item = this.queue.shift()!;
        if (this.cancelledJobs.has(item.jobId)) continue;
        this.runningCount++;
        void this.runItem(item).finally(() => {
          this.runningCount--;
          void this.pump();
        });
      }
    } finally {
      this.pumping = false;
    }
  }

  private async getEvaluators(job: JobRow): Promise<EvaluatorRow[]> {
    if (this.evaluatorsCache.has(job.id)) return this.evaluatorsCache.get(job.id)!;
    const all = await this.deps.evaluatorRepo.listByProject(job.projectId);
    const active = all.filter(e => job.evaluatorIds.includes(e.id));
    this.evaluatorsCache.set(job.id, active);
    return active;
  }

  private async runItem(item: JobItemRow): Promise<void> {
    const { evalJobRepo } = this.deps;
    const job = this.jobCache.get(item.jobId) ?? await evalJobRepo.getJob(item.jobId);
    if (!job) return;
    if (this.cancelledJobs.has(job.id)) return;

    await evalJobRepo.updateItemStatus(item.id, 'running');
    const startedAt = Date.now();

    try {
      const [datasetDetail, datasetItemsPage, promptDetail, provider] = await Promise.all([
        this.deps.datasetRepo.getDataset(job.datasetId),
        this.deps.datasetRepo.listDatasetItems(job.datasetId),
        this.deps.promptRepo.getPrompt(job.promptId),
        this.deps.providerRepo.getWithKey(job.providerId),
      ]);
      if (!datasetDetail || !promptDetail || !provider) {
        throw new Error('依赖资源缺失');
      }
      const datasetItem = datasetItemsPage.find(di => di.id === item.datasetItemId);
      if (!datasetItem) throw new Error('dataset item 不存在');

      const versions = await this.deps.promptRepo.listVersions(job.promptId);
      const version = versions.find(v => v.version === job.promptVersion);
      if (!version) throw new Error(`prompt version ${job.promptVersion} 不存在`);

      const rendered = renderTemplate(version.template, datasetItem.input);
      const messages = [{ role: 'user', content: rendered }];

      const llmResp = await chatComplete(
        { baseURL: provider.baseURL, apiKey: provider.apiKey },
        job.model,
        messages,
      );
      const latencyMs = Date.now() - startedAt;

      const endTime = new Date();
      const traceId = await db.transaction(async (tx) => {
        const [inserted] = await tx.insert(schema.traces).values({
          projectId: job.projectId,
          name: `eval: ${job.name}`,
          input: { messages },
          output: { content: llmResp.content },
          metadata: { source: 'eval', evalJobId: job.id, jobItemId: item.id },
          timestamp: new Date(startedAt),
        }).returning({ id: schema.traces.id });
        await tx.insert(schema.observations).values({
          traceId: inserted.id,
          type: 'generation',
          name: promptDetail.name,
          startTime: new Date(startedAt),
          endTime,
          input: { messages },
          output: { content: llmResp.content },
          model: job.model,
          promptTokens: llmResp.promptTokens,
          completionTokens: llmResp.completionTokens,
        });
        return inserted.id;
      });

      const evaluators = await this.getEvaluators(job);
      const scores: { name: string; value: number; comment: string }[] = [];
      for (const ev of evaluators) {
        try {
          let result;
          if (ev.type === 'numeric_threshold') {
            result = await evaluateNumericThreshold(ev.config as NumericThresholdConfig, {
              latencyMs,
              promptTokens: llmResp.promptTokens,
              completionTokens: llmResp.completionTokens,
            });
          } else {
            result = await evaluateLlmJudge(
              ev.config as LlmJudgeConfig,
              this.deps.providerRepo,
              rendered,
              llmResp.content,
            );
          }
          scores.push({ ...result, name: ev.name });
          if (traceId) {
            await this.deps.scoreRepo.createScore({
              projectId: job.projectId,
              traceId,
              name: ev.name,
              value: result.value,
              comment: result.comment,
              source: 'eval_job',
            });
          }
        } catch {
          // 单个 evaluator 失败不影响其他
        }
      }

      await evalJobRepo.updateItemStatus(item.id, 'success', {
        output: { content: llmResp.content, scores },
        traceId: traceId ?? null,
        latencyMs,
      });
      await evalJobRepo.incrementJobCounter(job.id, 'completedItems');

      eventBus.emit('eval:item-completed', { jobId: job.id, itemId: item.id, status: 'success' });

      await this.maybeCompleteJob(job.id);
    } catch (e) {
      const message = (e as Error).message;
      await evalJobRepo.updateItemStatus(item.id, 'failed', { errorMessage: message });
      await evalJobRepo.incrementJobCounter(job.id, 'failedItems');
      eventBus.emit('eval:item-completed', { jobId: job.id, itemId: item.id, status: 'failed' });
      await this.maybeCompleteJob(job.id);
    }
  }

  private async maybeCompleteJob(jobId: string): Promise<void> {
    if (this.cancelledJobs.has(jobId)) return;
    const counts = await this.deps.evalJobRepo.countItemsByStatus(jobId);
    if (counts.pending > 0 || counts.running > 0) return;
    if (this.queue.some(i => i.jobId === jobId)) return;

    const job = await this.deps.evalJobRepo.getJob(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return;

    const finalStatus = counts.failed > 0 && counts.success === 0 ? 'failed' : 'completed';
    const items = await this.deps.evalJobRepo.listItems(jobId, { limit: 1000 });
    const evaluators = await this.getEvaluators(job);
    const summary: Record<string, { avg: number; passRate: number; count: number }> = {};
    for (const ev of evaluators) {
      const values: number[] = [];
      let passCount = 0;
      for (const it of items.items) {
        const out = it.output as { scores?: { name: string; value: number }[] } | null;
        const s = out?.scores?.find(s => s.name === ev.name);
        if (s) {
          values.push(s.value);
          if (s.value >= 0.5) passCount++;
        }
      }
      if (values.length > 0) {
        summary[ev.name] = {
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          passRate: passCount / values.length,
          count: values.length,
        };
      }
    }
    await this.deps.evalJobRepo.setJobSummary(jobId, summary);
    await this.deps.evalJobRepo.updateJobStatus(jobId, finalStatus);
    eventBus.emit('eval:job-completed', { jobId, projectId: job.projectId, status: finalStatus });
  }
}

let singleton: EvalWorker | null = null;

export function initEvalWorker(deps: EvalWorkerDeps): EvalWorker {
  if (!singleton) singleton = new EvalWorker(deps);
  return singleton;
}

export function getEvalWorker(): EvalWorker | null {
  return singleton;
}
