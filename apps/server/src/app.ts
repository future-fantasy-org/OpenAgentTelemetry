import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { healthRoutes } from './routes/health.js';
import { buildIngestionRoutes } from './routes/ingestion.js';
import { buildTracesRoutes } from './routes/traces.js';
import { buildTraceDetailRoutes } from './routes/trace-detail.js';
import { buildScoreRoutes } from './routes/scores.js';
import { buildDatasetRoutes } from './routes/datasets.js';
import { buildPromptRoutes } from './routes/prompts.js';
import { buildStatsRoutes } from './routes/stats.js';
import { buildAuthRoutes } from './routes/auth.js';
import { buildAlertRoutes } from './routes/alerts.js';
import { buildProjectRoutes } from './routes/projects.js';
import { buildAuditRoutes } from './routes/audit.js';
import { registerAuthHook } from './auth/require-auth.js';
import { registerProjectAccessHook } from './auth/require-project.js';
import { registerAuditHook } from './auth/register-audit-hook.js';
import type { ITraceRepository } from './repositories/trace-repository.js';
import type { IProjectRepository } from './repositories/project-repository.js';
import type { IScoreRepository } from './repositories/score-repository.js';
import type { IDatasetRepository } from './repositories/dataset-repository.js';
import type { IPromptRepository } from './repositories/prompt-repository.js';
import type { IStatsRepository } from './repositories/stats-repository.js';
import type { IUserRepository } from './repositories/user-repository.js';
import type { IAlertRepository } from './repositories/alert-repository.js';
import type { IAuditRepository } from './repositories/audit-repository.js';
import type { AlertEvaluator } from './modules/alert-evaluator.js';

// module augmentation：让 FastifyRequest 类型带上可选 user 字段
// preHandler 校验 JWT 后把 {userId,email,role} 挂上去，路由里可直接 req.user 读
declare module 'fastify' {
  interface FastifyRequest {
    user?: { userId: string; email: string; role: string };
  }
}

// app 工厂：把依赖作为参数传入，测试时可传 mock
export interface AppDeps {
  traceRepo: ITraceRepository;
  projectRepo: IProjectRepository;
  scoreRepo: IScoreRepository;
  datasetRepo: IDatasetRepository;
  promptRepo: IPromptRepository;
  statsRepo: IStatsRepository;
  userRepo: IUserRepository;
  alertRepo: IAlertRepository;
  auditRepo: IAuditRepository;
  alertEvaluator: AlertEvaluator;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true, credentials: true }); // credentials:true 让前端 fetch 能带 cookie
  await app.register(cookie); // 解析 cookie，preHandler 和 logout 依赖它
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

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
  await app.register(buildAuthRoutes(deps.userRepo));
  await app.register(buildAlertRoutes(deps));
  await app.register(buildProjectRoutes(deps));
  await app.register(buildAuditRoutes(deps));

  // 全局鉴权钩子：必须在所有路由注册之后、listen 之前加
  // 保护所有 /api/*（除放行名单），让 SDK 摄取 /api/public/* 和 /api/auth/login 不受影响
  registerAuthHook(app);
  registerProjectAccessHook(app, deps.projectRepo);
  registerAuditHook(app, deps.auditRepo);

  return app;
}
