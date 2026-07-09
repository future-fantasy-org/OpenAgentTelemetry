import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import { buildIngestionRoutes } from './routes/ingestion.js';
import { buildTracesRoutes } from './routes/traces.js';
import { buildTraceDetailRoutes } from './routes/trace-detail.js';
import { buildScoreRoutes } from './routes/scores.js';
import { buildDatasetRoutes } from './routes/datasets.js';
import { buildPromptRoutes } from './routes/prompts.js';
import { buildStatsRoutes } from './routes/stats.js';
import type { ITraceRepository } from './repositories/trace-repository.js';
import type { IProjectRepository } from './repositories/project-repository.js';
import type { IScoreRepository } from './repositories/score-repository.js';
import type { IDatasetRepository } from './repositories/dataset-repository.js';
import type { IPromptRepository } from './repositories/prompt-repository.js';
import type { IStatsRepository } from './repositories/stats-repository.js';

// app 工厂：把依赖作为参数传入，测试时可传 mock
export interface AppDeps {
  traceRepo: ITraceRepository;
  projectRepo: IProjectRepository;
  scoreRepo: IScoreRepository;
  datasetRepo: IDatasetRepository;
  promptRepo: IPromptRepository;
  statsRepo: IStatsRepository;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true }); // 允许前端跨域

  await app.register(healthRoutes);
  await app.register(buildIngestionRoutes(deps));
  await app.register(buildTracesRoutes(deps));
  await app.register(buildTraceDetailRoutes(deps.traceRepo));
  await app.register(buildScoreRoutes(deps.scoreRepo, async (apiKey) => {
    const project = await deps.projectRepo.findByApiKey(apiKey);
    return project?.id ?? null;
  }));
  await app.register(buildDatasetRoutes(deps.datasetRepo));
  await app.register(buildPromptRoutes(deps.promptRepo));
  await app.register(buildStatsRoutes(deps.statsRepo));

  return app;
}
