import type { FastifyPluginAsync } from 'fastify';
import { ingestionBatchSchema } from '@oat/shared';
import type { ITraceRepository } from '../repositories/trace-repository.js';
import type { IProjectRepository } from '../repositories/project-repository.js';
import { IngestionService } from '../modules/ingestion-service.js';

// 用闭包工厂模式：deps 通过闭包捕获，避免 Fastify 泛型插件的 options 类型陷阱
export function buildIngestionRoutes(deps: {
  traceRepo: ITraceRepository;
  projectRepo: IProjectRepository;
}): FastifyPluginAsync {
  return async (app) => {
    const service = new IngestionService(deps.traceRepo);

    app.post('/api/public/ingestion', async (req, reply) => {
      // 1. 用 API Key 鉴权
      const authHeader = req.headers.authorization;
      const apiKey = authHeader?.replace('Bearer ', '');
      if (!apiKey) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: '缺少 API Key' } });

      const project = await deps.projectRepo.findByApiKey(apiKey);
      if (!project) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: '无效的 API Key' } });

      // 2. 用 Zod 校验请求体
      const parsed = ingestionBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }

      // 3. 执行写入
      await service.ingest(project.id, parsed.data.batch);

      // 4. 立即返回 202（M1 先同步写；后续 M2 改为入队异步）
      return reply.code(202).send({ accepted: parsed.data.batch.length });
    });
  };
}
