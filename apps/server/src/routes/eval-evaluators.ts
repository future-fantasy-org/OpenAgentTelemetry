import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { IEvaluatorRepository } from '../repositories/evaluator-repository.js';

const llmJudgeConfigSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  judgePrompt: z.string().min(1),
  min: z.number(),
  max: z.number(),
});

const numericThresholdConfigSchema = z.object({
  metric: z.enum(['latency_ms', 'prompt_tokens', 'completion_tokens', 'total_cost']),
  operator: z.enum(['lt', 'lte', 'gt', 'gte']),
  threshold: z.number(),
  passScore: z.number(),
  failScore: z.number(),
});

const createSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['llm_judge', 'numeric_threshold']),
  config: z.union([llmJudgeConfigSchema, numericThresholdConfigSchema]),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.union([llmJudgeConfigSchema, numericThresholdConfigSchema]).optional(),
});

export function buildEvalEvaluatorRoutes(deps: { evaluatorRepo: IEvaluatorRepository }): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/eval/evaluators', async (req) => {
      const { projectId } = req.query as { projectId: string };
      if (!projectId) return { evaluators: [] };
      const evaluators = await deps.evaluatorRepo.listByProject(projectId);
      return { evaluators };
    });

    app.get('/api/eval/evaluators/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const evaluator = await deps.evaluatorRepo.get(id);
      if (!evaluator) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '评估器不存在' } });
      return evaluator;
    });

    app.post('/api/eval/evaluators', async (req, reply) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      const evaluator = await deps.evaluatorRepo.create(parsed.data);
      return reply.status(201).send(evaluator);
    });

    app.put('/api/eval/evaluators/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      const evaluator = await deps.evaluatorRepo.update(id, parsed.data);
      if (!evaluator) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '评估器不存在' } });
      return evaluator;
    });

    app.delete('/api/eval/evaluators/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      await deps.evaluatorRepo.delete(id);
      return reply.status(204).send();
    });
  };
}
