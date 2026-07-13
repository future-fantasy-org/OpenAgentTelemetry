import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository, IProjectRepository, IScoreRepository,
  IDatasetRepository, IPromptRepository, IStatsRepository,
  IUserRepository, IAlertRepository, IAuditRepository,
  TraceListItem, TraceDetail, ProjectListItem,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';
import { eventBus } from '../src/modules/event-bus.js';

process.env.JWT_SECRET = 'test-secret';
import { signToken } from '../src/auth/jwt.js';

async function authCookie(): Promise<string> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return `oat_session=${token}`;
}

function makeMockDeps() {
  const traceRepo: ITraceRepository = {
    async listTraces(): Promise<TraceListItem[]> { return []; },
    async getTraceDetail(): Promise<TraceDetail | null> { return null; },
    async createTraceWithObservations() {},
  };
  const projectRepo: IProjectRepository = {
    async findByApiKey() { return null; },
    async listAll() { return [{ id: 'p1', name: 'demo', apiKeyPreview: 'abcd', createdAt: new Date() } as ProjectListItem]; },
    async exists() { return true; },
  };
  const scoreRepo: IScoreRepository = { async createScore() { return 's1'; }, async listScoresByTrace() { return []; } };
  const datasetRepo: IDatasetRepository = {
    async createDataset() { return 'd1'; }, async listDatasets() { return []; },
    async getDataset() { return null; }, async addDatasetItem() { return 'i1'; }, async listDatasetItems() { return []; },
  };
  const promptRepo: IPromptRepository = {
    async createPrompt() { return { promptId: 'p1', version: 1 }; }, async listPrompts() { return []; },
    async getPrompt() { return null; }, async getPromptByName() { return null; },
    async addVersion() { return 2; }, async listVersions() { return []; },
  };
  const statsRepo: IStatsRepository = {
    async getOverview() {
      return { range: '24h', series: [], summary: { totalTraces: 0, totalTokens: 0, totalCost: '0', avgLatencyMs: null }, topModels: [], scoreDistribution: [] };
    },
  };
  const userRepo: IUserRepository = {
    async findByEmail() { return null; },
    async create(email, passwordHash) { return { id: 'u1', email, passwordHash, role: 'admin', createdAt: new Date(), updatedAt: new Date() }; },
  };
  const alertRepo: IAlertRepository = {
    async listRules() { return []; }, async getRule() { return null; },
    async createRule() { throw new Error('not implemented'); }, async updateRule() { return null; },
    async deleteRule() {}, async listEvents() { return []; }, async createEvent() {},
  };
  const auditRepo: IAuditRepository = {
    async log(entry) { return { ...entry, id: 'a1', createdAt: new Date() } as any; },
    async list() { return { logs: [], nextCursor: null }; },
  };
  const alertEvaluator = { evaluate: async () => {}, testWebhook: async () => false } as unknown as AlertEvaluator;
  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, auditRepo, alertEvaluator };
}

const startedApps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of startedApps) {
    try { await app.close(); } catch {}
  }
  startedApps.length = 0;
});

async function startApp(): Promise<{ app: FastifyInstance; baseUrl: string }> {
  const app = await buildApp(makeMockDeps());
  await app.listen({ port: 0, host: '127.0.0.1' });
  startedApps.push(app);
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}

// 用 fetch 读 SSE 流的前若干字符，等匹配到目标 pattern 或超时
async function readUntilMatch(
  stream: ReadableStream<Uint8Array>,
  pattern: string,
  timeoutMs = 2000,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise<{ value: undefined; done: true }>((resolve) => setTimeout(() => resolve({ value: undefined, done: true }), timeoutMs)),
    ]);
    if (value) {
      buf += decoder.decode(value, { stream: true });
      if (buf.includes(pattern)) {
        reader.cancel().catch(() => {});
        return buf;
      }
    }
    if (done) break;
  }
  reader.cancel().catch(() => {});
  return buf;
}

describe('SSE 实时流端点', () => {
  it('/api/stream/traces 未认证返回 401', async () => {
    const { app } = await startApp();
    const res = await app.inject({ method: 'GET', url: '/api/stream/traces' });
    expect(res.statusCode).toBe(401);
  });

  it('/api/stream/traces 连接后推送 trace:created', async () => {
    const { baseUrl } = await startApp();
    const resp = await fetch(`${baseUrl}/api/stream/traces`, {
      headers: { cookie: await authCookie() },
    });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('text/event-stream');

    const readPromise = readUntilMatch(resp.body!, 'event: trace:created');
    await new Promise((r) => setTimeout(r, 100));
    eventBus.emit('trace:created', {
      projectId: 'p1',
      trace: { id: 't1', name: 'test', userId: null, sessionId: null, timestamp: new Date().toISOString() },
    });
    const received = await readPromise;
    expect(received).toContain('event: trace:created');
    expect(received).toContain('"id":"t1"');
  });

  it('/api/stream/audit-logs 推送 audit:logged', async () => {
    const { baseUrl } = await startApp();
    const resp = await fetch(`${baseUrl}/api/stream/audit-logs`, {
      headers: { cookie: await authCookie() },
    });
    expect(resp.status).toBe(200);

    const readPromise = readUntilMatch(resp.body!, 'event: audit:logged');
    await new Promise((r) => setTimeout(r, 100));
    eventBus.emit('audit:logged', {
      log: { id: 'a1', action: 'auth.login.success', method: 'POST', path: '/api/auth/login', statusCode: 200 },
    });
    const received = await readPromise;
    expect(received).toContain('event: audit:logged');
    expect(received).toContain('auth.login.success');
  });

  it('projectId 过滤：不匹配的事件不推送', async () => {
    const { baseUrl } = await startApp();
    const resp = await fetch(`${baseUrl}/api/stream/traces?projectId=p1`, {
      headers: { cookie: await authCookie() },
    });
    expect(resp.status).toBe(200);

    // 发一个 projectId=p2 的事件，应该被过滤
    eventBus.emit('trace:created', {
      projectId: 'p2',
      trace: { id: 't-other', name: 'other', userId: null, sessionId: null, timestamp: new Date().toISOString() },
    });
    await new Promise((r) => setTimeout(r, 200));

    // 再发一个 projectId=p1 的事件，应该收到
    const readPromise = readUntilMatch(resp.body!, 'event: trace:created');
    eventBus.emit('trace:created', {
      projectId: 'p1',
      trace: { id: 't1', name: 'test', userId: null, sessionId: null, timestamp: new Date().toISOString() },
    });
    const received = await readPromise;
    expect(received).toContain('"id":"t1"');
    expect(received).not.toContain('t-other');
  });
});
