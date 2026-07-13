import type { FastifyInstance } from 'fastify';
import type { IProjectRepository } from '../repositories/project-repository.js';

export function registerProjectAccessHook(app: FastifyInstance, projectRepo: IProjectRepository) {
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/api/')) return;

    const projectId = (req.query as { projectId?: string }).projectId
      ?? (req.body as { projectId?: string } | null)?.projectId;
    if (!projectId) return;

    const ok = await projectRepo.exists(projectId);
    if (!ok) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '项目不存在' } });
    }
  });
}
