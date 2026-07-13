import type { FastifyPluginAsync } from 'fastify';
import type { IProjectRepository } from '../repositories/project-repository.js';

export function buildProjectRoutes(deps: {
  projectRepo: IProjectRepository;
}): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/projects', async () => {
      const projects = await deps.projectRepo.listAll();
      return { projects };
    });
  };
}
