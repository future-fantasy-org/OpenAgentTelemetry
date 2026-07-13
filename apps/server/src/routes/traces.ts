import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ITraceRepository } from '../repositories/trace-repository.js';

const querySchema = z.object({
  projectId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

// 用闭包工厂模式：deps 通过闭包捕获
export function buildTracesRoutes(deps: { traceRepo: ITraceRepository }): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/traces', async (req, reply) => {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      const { projectId, limit, cursor } = parsed.data;
      // 取 limit+1 条，多取的一条用来判断是否有下一页
      const traces = await deps.traceRepo.listTraces(projectId, limit + 1, cursor);
      const hasMore = traces.length > limit;
      const pageTraces = hasMore ? traces.slice(0, limit) : traces;
      const nextCursor = hasMore && pageTraces.length > 0
        ? pageTraces[pageTraces.length - 1].timestamp.toISOString()
        : null;
      return { traces: pageTraces, nextCursor };
    });
  };
}
