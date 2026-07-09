import { buildApp } from './app.js';
import {
  PostgresTraceRepository,
  PostgresProjectRepository,
  PostgresScoreRepository,
  PostgresDatasetRepository,
  PostgresPromptRepository,
  PostgresStatsRepository,
} from './repositories/index.js';

async function main() {
  const app = await buildApp({
    traceRepo: new PostgresTraceRepository(),
    projectRepo: new PostgresProjectRepository(),
    scoreRepo: new PostgresScoreRepository(),
    datasetRepo: new PostgresDatasetRepository(),
    promptRepo: new PostgresPromptRepository(),
    statsRepo: new PostgresStatsRepository(),
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Server 监听 http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
