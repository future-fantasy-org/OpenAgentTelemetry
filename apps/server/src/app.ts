import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import { buildIngestionRoutes } from './routes/ingestion.js';
import { buildTracesRoutes } from './routes/traces.js';
import type { ITraceRepository } from './repositories/trace-repository.js';
import type { IProjectRepository } from './repositories/project-repository.js';

// app 工厂：把依赖作为参数传入，测试时可传 mock
export interface AppDeps {
  traceRepo: ITraceRepository;
  projectRepo: IProjectRepository;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true }); // 允许前端跨域

  await app.register(healthRoutes);
  await app.register(buildIngestionRoutes(deps));
  await app.register(buildTracesRoutes(deps));

  return app;
}
