import type { FastifyPluginAsync } from 'fastify';
import type { IScoreRepository } from '../repositories/score-repository.js';

export function buildScoreRoutes(
  scoreRepo: IScoreRepository,
  resolveProjectId: (apiKey: string) => Promise<string | null>,
): FastifyPluginAsync {
  return async (app) => {
    // POST /api/public/scores — 给某个 trace 打分（API Key 鉴权）
    app.post('/api/public/scores', async (req, reply) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: '缺少 API Key' });
      }
      const apiKey = authHeader.slice(7);
      const projectId = await resolveProjectId(apiKey);
      if (!projectId) {
        return reply.status(401).send({ error: 'API Key 无效' });
      }

      const body = req.body as {
        traceId?: string;
        name: string;
        value: number;
        comment?: string;
      };

      if (!body.name || typeof body.value !== 'number') {
        return reply.status(400).send({ error: 'name 和 value 必填' });
      }

      const id = await scoreRepo.createScore({
        projectId,
        traceId: body.traceId ?? null,
        name: body.name,
        value: body.value,
        comment: body.comment,
        source: 'api',
      });

      return { id };
    });

    // GET /api/traces/:id/scores — 查某个 trace 的所有打分
    app.get('/api/traces/:id/scores', async (req) => {
      const { id } = req.params as { id: string };
      const scores = await scoreRepo.listScoresByTrace(id);
      return { scores };
    });
  };
}
