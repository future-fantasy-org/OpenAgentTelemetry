import { hash } from '@node-rs/argon2';
import { buildApp } from './app.js';
import { validateEncryptionKey } from './modules/crypto.js';
import {
  PostgresTraceRepository,
  PostgresProjectRepository,
  PostgresScoreRepository,
  PostgresDatasetRepository,
  PostgresPromptRepository,
  PostgresStatsRepository,
  PostgresUserRepository,
  PostgresAlertRepository,
  PostgresAuditRepository,
  PostgresProviderRepository,
  PostgresEvaluatorRepository,
  PostgresEvalJobRepository,
} from './repositories/index.js';
import { AlertEvaluator } from './modules/alert-evaluator.js';
import { initEvalWorker } from './modules/eval-worker.js';

// 引导管理员：启动时读 ADMIN_EMAIL/ADMIN_PASSWORD，若 users 表无该 email 则创建
// 幂等：已存在则跳过（不覆盖密码，避免重启冲掉管理员手动改的密码）
async function bootstrapAdmin(userRepo: PostgresUserRepository) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('ADMIN_EMAIL/ADMIN_PASSWORD 未设置，跳过管理员引导。请手动创建用户。');
    return;
  }
  const existing = await userRepo.findByEmail(email);
  if (existing) return;
  const passwordHash = await hash(password);
  await userRepo.create(email, passwordHash);
  console.log(`已引导管理员账号：${email}`);
}

async function main() {
  // JWT_SECRET 必填：没有它签不出 token，整个认证没法工作
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET 未设置，拒绝启动。请在环境变量里配置一个随机字符串。');
    process.exit(1);
  }

  validateEncryptionKey();

  const userRepo = new PostgresUserRepository();
  await bootstrapAdmin(userRepo);

  const alertRepo = new PostgresAlertRepository();
  const alertEvaluator = new AlertEvaluator(alertRepo);

  const providerRepo = new PostgresProviderRepository();
  const evaluatorRepo = new PostgresEvaluatorRepository();
  const evalJobRepo = new PostgresEvalJobRepository();
  const datasetRepo = new PostgresDatasetRepository();
  const traceRepo = new PostgresTraceRepository();
  const scoreRepo = new PostgresScoreRepository();
  const promptRepo = new PostgresPromptRepository();

  // 崩溃恢复：清扫上次未完成的 running/pending 任务
  const interrupted = await evalJobRepo.interruptRunning();
  if (interrupted > 0) {
    console.log(`[eval] 检测到 ${interrupted} 个未完成任务，已标记为 interrupted`);
  }

  const evalWorker = initEvalWorker({
    evalJobRepo, evaluatorRepo, providerRepo, datasetRepo, traceRepo, scoreRepo, promptRepo,
  });

  const app = await buildApp({
    traceRepo,
    projectRepo: new PostgresProjectRepository(),
    scoreRepo,
    datasetRepo,
    promptRepo,
    statsRepo: new PostgresStatsRepository(),
    userRepo,
    alertRepo,
    auditRepo: new PostgresAuditRepository(),
    alertEvaluator,
    providerRepo,
    evaluatorRepo,
    evalJobRepo,
    evalWorker,
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Server 监听 http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
