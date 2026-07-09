import type { FastifyPluginAsync } from 'fastify';
import type { IStatsRepository } from '../repositories/stats-repository.js';

const VALID_RANGES = ['1h', '24h', '7d', '30d'];

export function buildStatsRoutes(statsRepo: IStatsRepository): FastifyPluginAsync {
  return async (app) => {
    // GET /api/stats/overview?projectId=xxx&range=24h — 项目级统计聚合
    app.get('/api/stats/overview', async (req, reply) => {
      const { projectId, range } = req.query as { projectId?: string; range?: string };
      if (!projectId) return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: '缺少 projectId' } });
      const r = range && VALID_RANGES.includes(range) ? range : '24h';
      const overview = await statsRepo.getOverview(projectId, r);
      return overview;
    });
  };
}
