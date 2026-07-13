import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { IEvalJobRepository } from '../repositories/eval-job-repository.js';
import type { IDatasetRepository } from '../repositories/dataset-repository.js';
import type { EvalWorker } from '../modules/eval-worker.js';
import { eventBus } from '../modules/event-bus.js';

const createJobSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  datasetId: z.string().min(1),
  promptId: z.string().min(1),
  promptVersion: z.number().int().positive(),
  providerId: z.string().min(1),
  model: z.string().min(1),
  evaluatorIds: z.array(z.string().min(1)).min(1),
  concurrency: z.number().int().min(1).max(10).optional(),
});

export function buildEvalJobRoutes(deps: {
  evalJobRepo: IEvalJobRepository;
  datasetRepo: IDatasetRepository;
  evalWorker: EvalWorker;
}): FastifyPluginAsync {
  return async (app) => {
    app.post('/api/eval/jobs', async (req, reply) => {
      const parsed = createJobSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      const data = parsed.data;

      const dataset = await deps.datasetRepo.getDataset(data.datasetId);
      if (!dataset) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '数据集不存在' } });
      }
      const items = await deps.datasetRepo.listDatasetItems(data.datasetId);
      if (items.length === 0) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: '数据集为空' } });
      }

      const job = await deps.evalJobRepo.createJob({
        projectId: data.projectId,
        name: data.name,
        datasetId: data.datasetId,
        promptId: data.promptId,
        promptVersion: data.promptVersion,
        providerId: data.providerId,
        model: data.model,
        evaluatorIds: data.evaluatorIds,
        concurrency: data.concurrency,
        totalItems: items.length,
      });
      await deps.evalJobRepo.createItems(job.id, items.map(i => i.id));

      eventBus.emit('eval:job-started', { jobId: job.id, projectId: job.projectId });

      return reply.status(201).send(job);
    });

    app.get('/api/eval/jobs', async (req) => {
      const { projectId, cursor, limit } = req.query as { projectId: string; cursor?: string; limit?: string };
      const result = await deps.evalJobRepo.listJobs(projectId, {
        cursor,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return result;
    });

    app.get('/api/eval/jobs/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const job = await deps.evalJobRepo.getJob(id);
      if (!job) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
      return job;
    });

    app.get('/api/eval/jobs/:id/items', async (req) => {
      const { id } = req.params as { id: string };
      const { cursor, limit, status } = req.query as { cursor?: string; limit?: string; status?: string };
      return deps.evalJobRepo.listItems(id, {
        cursor,
        limit: limit ? parseInt(limit, 10) : undefined,
        status: status as 'pending' | 'running' | 'success' | 'failed' | undefined,
      });
    });

    app.post('/api/eval/jobs/:id/cancel', async (req, reply) => {
      const { id } = req.params as { id: string };
      const job = await deps.evalJobRepo.getJob(id);
      if (!job) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return reply.status(409).send({ error: { code: 'CONFLICT', message: `任务已处于终态：${job.status}` } });
      }
      deps.evalWorker.cancelJob(id);
      return reply.status(200).send({ ok: true });
    });

    app.delete('/api/eval/jobs/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const job = await deps.evalJobRepo.getJob(id);
      if (!job) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
      deps.evalWorker.cancelJob(id);
      return reply.status(204).send();
    });
  };
}
