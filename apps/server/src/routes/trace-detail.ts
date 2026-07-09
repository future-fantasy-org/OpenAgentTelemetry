import type { FastifyPluginAsync } from 'fastify';
import type { ITraceRepository } from '../repositories/trace-repository.js';

// 闭包工厂模式：把 deps 通过闭包捕获，避免 Fastify 泛型插件的 options 类型陷阱
export function buildTraceDetailRoutes(traceRepo: ITraceRepository): FastifyPluginAsync {
  return async (app) => {
    // GET /api/traces/:id — 返回完整 trace + 所有 observations（前端详情页用）
    app.get('/api/traces/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const detail = await traceRepo.getTraceDetail(id);
      if (!detail) {
        return reply.status(404).send({ error: 'trace 不存在' });
      }
      return detail;
    });
  };
}
