# M11 审计日志 + M12 实时刷新与分页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OAT 补齐审计日志（M11）和 SSE 实时刷新 + cursor 分页（M12），形成可审计、可追踪、可扩展的闭环。

**Architecture:** M11 用 Fastify onResponse 全局钩子捕获写操作和错误事件，派生 action 后写入 `audit_logs` 表。M12 用进程内 EventEmitter 单例，在 ingestion/alert/audit 三处 emit 事件，SSE 端点订阅后按 projectId 过滤推送给浏览器。Traces 列表和 Audit 日志改为 cursor 分页（基于 created_at DESC）。

**Tech Stack:** Fastify onResponse hook、node:events EventEmitter、text/event-stream SSE、Drizzle ORM、Next.js 14 Server Components + EventSource、Vitest。

---

## 文件结构

### 新建文件（server）
- `apps/server/src/modules/event-bus.ts` — EventEmitter 单例，M12 SSE 事件总线
- `apps/server/src/modules/derive-action.ts` — 纯函数：method+path+status → action/resourceType
- `apps/server/src/repositories/audit-repository.ts` — IAuditRepository 接口 + PostgresAuditRepository
- `apps/server/src/auth/register-audit-hook.ts` — onResponse 钩子注册
- `apps/server/src/routes/audit.ts` — GET /api/audit/logs（cursor 分页）
- `apps/server/src/routes/stream.ts` — 三条 SSE 端点
- `apps/server/drizzle/0006_audit_logs.sql` — 新建 audit_logs 表迁移
- `apps/server/tests/derive-action.test.ts` — action 派生规则单测
- `apps/server/tests/audit-hook.test.ts` — onResponse 钩子单测
- `apps/server/tests/audit-api.test.ts` — GET /api/audit/logs 单测
- `apps/server/tests/stream.test.ts` — SSE 端点单测
- `apps/server/tests/trace-cursor.test.ts` — cursor 分页单测

### 新建文件（web）
- `apps/web/src/app/audit/page.tsx` — SSR 首屏
- `apps/web/src/app/audit/AuditClient.tsx` — 客户端交互（筛选+表格+SSE+加载更多）

### 修改文件
- `apps/server/src/db/schema.ts` — 新增 auditLogs 表定义
- `apps/server/src/db/client.ts` — 导出 auditLogs schema
- `apps/server/src/repositories/index.ts` — 导出 IAuditRepository + AuditLog 类型
- `apps/server/src/repositories/trace-repository.ts` — listTraces 加 cursor 参数
- `apps/server/src/routes/traces.ts` — cursor 分页响应
- `apps/server/src/modules/ingestion-service.ts` — 写入后 emit trace:created
- `apps/server/src/modules/alert-evaluator.ts` — createEvent 后 emit alert:triggered
- `apps/server/src/app.ts` — 注册 audit hook + audit routes + stream routes + AppDeps 新增 auditRepo
- `apps/server/drizzle/meta/_journal.json` — 新增 idx 6
- `apps/server/src/server.ts` — 构造 PostgresAuditRepository 注入
- `apps/web/src/lib/api.shared.ts` — 新增 AuditLog 类型 + cursor 分页响应类型
- `apps/web/src/lib/api.server.ts` — listTraces 改为返回 {traces, nextCursor}，新增 listAuditLogs
- `apps/web/src/lib/api.client.ts` — 新增 listAuditLogs（客户端用）
- `apps/web/src/app/page.tsx` — Traces 列表加 cursor 分页 + SSE
- `apps/web/src/components/nav.tsx` — 新增 /audit 链接
- `apps/web/src/app/alerts/AlertClient.tsx` — 加 SSE 实时事件

---

## Task 1: audit_logs 表 — schema + 迁移 + AuditRepository

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Modify: `apps/server/drizzle/meta/_journal.json`
- Create: `apps/server/drizzle/0006_audit_logs.sql`
- Create: `apps/server/src/repositories/audit-repository.ts`
- Modify: `apps/server/src/repositories/index.ts`

- [ ] **Step 1: 新增 audit_logs schema 定义**

在 `apps/server/src/db/schema.ts` 末尾追加：

```typescript
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  actorEmail: text('actor_email'),
  actorIp: text('actor_ip'),
  action: text('action').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  projectId: uuid('project_id'),
  statusCode: integer('status_code').notNull(),
  durationMs: integer('duration_ms'),
  metadata: jsonb('metadata').default({}),
});
```

- [ ] **Step 2: 创建迁移 SQL**

创建 `apps/server/drizzle/0006_audit_logs.sql`：

```sql
CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_email" text,
  "actor_ip" text,
  "action" text NOT NULL,
  "method" text NOT NULL,
  "path" text NOT NULL,
  "resource_type" text,
  "resource_id" text,
  "project_id" uuid,
  "status_code" integer NOT NULL,
  "duration_ms" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX idx_audit_logs_created_at ON "audit_logs" (created_at DESC);
CREATE INDEX idx_audit_logs_project_id ON "audit_logs" (project_id);
CREATE INDEX idx_audit_logs_action ON "audit_logs" (action);
```

- [ ] **Step 3: 更新 _journal.json**

在 `apps/server/drizzle/meta/_journal.json` 的 entries 数组末尾追加：

```json
,
{
  "idx": 6,
  "version": "7",
  "when": 1783948000000,
  "tag": "0006_audit_logs",
  "breakpoints": true
}
```

- [ ] **Step 4: 创建 AuditRepository**

创建 `apps/server/src/repositories/audit-repository.ts`：

```typescript
import { db, schema } from '../db/client.js';
import { eq, desc, lt, and, gte, lte } from 'drizzle-orm';

export type AuditLog = {
  id: string;
  createdAt: Date;
  actorEmail: string | null;
  actorIp: string | null;
  action: string;
  method: string;
  path: string;
  resourceType: string | null;
  resourceId: string | null;
  projectId: string | null;
  statusCode: number;
  durationMs: number | null;
  metadata: Record<string, unknown>;
};

export type NewAuditLog = Omit<AuditLog, 'id' | 'createdAt'>;

export interface IAuditRepository {
  log(entry: NewAuditLog): Promise<AuditLog>;
  list(params: {
    projectId?: string;
    action?: string;
    actorEmail?: string;
    from?: Date;
    to?: Date;
    cursor?: string;
    limit?: number;
  }): Promise<{ logs: AuditLog[]; nextCursor: string | null }>;
}

export class PostgresAuditRepository implements IAuditRepository {
  async log(entry: NewAuditLog): Promise<AuditLog> {
    const [row] = await db.insert(schema.auditLogs).values({
      actorEmail: entry.actorEmail,
      actorIp: entry.actorIp,
      action: entry.action,
      method: entry.method,
      path: entry.path,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      projectId: entry.projectId,
      statusCode: entry.statusCode,
      durationMs: entry.durationMs,
      metadata: entry.metadata,
    }).returning();
    return row as AuditLog;
  }

  async list(params: {
    projectId?: string;
    action?: string;
    actorEmail?: string;
    from?: Date;
    to?: Date;
    cursor?: string;
    limit?: number;
  }): Promise<{ logs: AuditLog[]; nextCursor: string | null }> {
    const limit = Math.min(params.limit ?? 50, 200);
    const conditions = [];
    if (params.projectId) conditions.push(eq(schema.auditLogs.projectId, params.projectId));
    if (params.action) conditions.push(eq(schema.auditLogs.action, params.action));
    if (params.actorEmail) conditions.push(eq(schema.auditLogs.actorEmail, params.actorEmail));
    if (params.from) conditions.push(gte(schema.auditLogs.createdAt, params.from));
    if (params.to) conditions.push(lte(schema.auditLogs.createdAt, params.to));
    if (params.cursor) {
      conditions.push(lt(schema.auditLogs.createdAt, new Date(params.cursor)));
    }

    const rows = await db.select().from(schema.auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const logs = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && logs.length > 0
      ? logs[logs.length - 1].createdAt.toISOString()
      : null;

    return { logs: logs as AuditLog[], nextCursor };
  }
}
```

- [ ] **Step 5: 更新 index.ts 导出**

在 `apps/server/src/repositories/index.ts` 末尾追加：

```typescript
export type { AuditLog, NewAuditLog, IAuditRepository } from './audit-repository.js';
export { PostgresAuditRepository } from './audit-repository.js';
```

- [ ] **Step 6: lint 检查**

Run: `cd apps/server && pnpm lint`
Expected: 无错误。

- [ ] **Step 7: 应用迁移到本地 DB**

Run: `psql postgresql://oat:oat@localhost:5432/oat -f apps/server/drizzle/0006_audit_logs.sql`
Expected: CREATE TABLE + 3 CREATE INDEX 成功。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(m11): audit_logs 表 schema + 迁移 + AuditRepository"
```

---

## Task 2: derive-action 纯函数 + 单测

**Files:**
- Create: `apps/server/src/modules/derive-action.ts`
- Create: `apps/server/tests/derive-action.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/server/tests/derive-action.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { deriveAction, deriveResourceType, extractResourceId } from '../src/modules/derive-action.js';

describe('deriveAction', () => {
  it('POST /api/auth/login 200 → auth.login.success', () => {
    expect(deriveAction('POST', '/api/auth/login', 200)).toBe('auth.login.success');
  });
  it('POST /api/auth/login 401 → auth.login.failed', () => {
    expect(deriveAction('POST', '/api/auth/login', 401)).toBe('auth.login.failed');
  });
  it('POST /api/auth/login 429 → auth.login.rate_limited', () => {
    expect(deriveAction('POST', '/api/auth/login', 429)).toBe('auth.login.rate_limited');
  });
  it('POST /api/auth/logout 200 → auth.logout', () => {
    expect(deriveAction('POST', '/api/auth/logout', 200)).toBe('auth.logout');
  });
  it('POST /api/public/ingestion 200 → ingestion', () => {
    expect(deriveAction('POST', '/api/public/ingestion', 200)).toBe('ingestion');
  });
  it('POST /api/public/ingestion 401 → ingestion.auth_failed', () => {
    expect(deriveAction('POST', '/api/public/ingestion', 401)).toBe('ingestion.auth_failed');
  });
  it('POST /api/datasets 201 → dataset.create', () => {
    expect(deriveAction('POST', '/api/datasets', 201)).toBe('dataset.create');
  });
  it('PUT /api/datasets/abc 200 → dataset.update', () => {
    expect(deriveAction('PUT', '/api/datasets/abc', 200)).toBe('dataset.update');
  });
  it('DELETE /api/datasets/abc 200 → dataset.delete', () => {
    expect(deriveAction('DELETE', '/api/datasets/abc', 200)).toBe('dataset.delete');
  });
  it('POST /api/prompts 201 → prompt.create', () => {
    expect(deriveAction('POST', '/api/prompts', 201)).toBe('prompt.create');
  });
  it('POST /api/alerts/rules 201 → alert_rule.create', () => {
    expect(deriveAction('POST', '/api/alerts/rules', 201)).toBe('alert_rule.create');
  });
  it('PUT /api/alerts/rules/abc 200 → alert_rule.update', () => {
    expect(deriveAction('PUT', '/api/alerts/rules/abc', 200)).toBe('alert_rule.update');
  });
  it('DELETE /api/alerts/rules/abc 204 → alert_rule.delete', () => {
    expect(deriveAction('DELETE', '/api/alerts/rules/abc', 204)).toBe('alert_rule.delete');
  });
  it('GET /api/traces 404 → idor.blocked', () => {
    expect(deriveAction('GET', '/api/traces', 404)).toBe('idor.blocked');
  });
  it('未知路由 fallback', () => {
    expect(deriveAction('POST', '/api/unknown', 200)).toBe('api.unknown');
  });
});

describe('deriveResourceType', () => {
  it('/api/datasets → dataset', () => {
    expect(deriveResourceType('/api/datasets')).toBe('dataset');
  });
  it('/api/prompts → prompt', () => {
    expect(deriveResourceType('/api/prompts')).toBe('prompt');
  });
  it('/api/alerts/rules → alert_rule', () => {
    expect(deriveResourceType('/api/alerts/rules')).toBe('alert_rule');
  });
  it('/api/auth/login → null', () => {
    expect(deriveResourceType('/api/auth/login')).toBeNull();
  });
});

describe('extractResourceId', () => {
  it('/api/datasets/abc-123 → abc-123', () => {
    expect(extractResourceId('/api/datasets/abc-123')).toBe('abc-123');
  });
  it('/api/alerts/rules/abc/test → abc（取第一段 path param）', () => {
    expect(extractResourceId('/api/alerts/rules/abc/test')).toBe('abc');
  });
  it('/api/datasets（无 id）→ null', () => {
    expect(extractResourceId('/api/datasets')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/server && pnpm vitest run tests/derive-action.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 derive-action**

创建 `apps/server/src/modules/derive-action.ts`：

```typescript
export function deriveAction(method: string, path: string, statusCode: number): string {
  if (path === '/api/auth/login') {
    if (statusCode === 429) return 'auth.login.rate_limited';
    if (statusCode >= 400) return 'auth.login.failed';
    return 'auth.login.success';
  }
  if (path === '/api/auth/logout') return 'auth.logout';
  if (path === '/api/public/ingestion') {
    if (statusCode >= 400) return 'ingestion.auth_failed';
    return 'ingestion';
  }

  const resource = deriveResourceType(path);
  if (resource) {
    const hasId = extractResourceId(path) !== null;
    let verb: string;
    if (method === 'POST') verb = 'create';
    else if (method === 'PUT' || method === 'PATCH') verb = hasId ? 'update' : 'create';
    else if (method === 'DELETE') verb = 'delete';
    else verb = 'access';
    return `${resource}.${verb}`;
  }

  if (statusCode === 404 && path.startsWith('/api/')) return 'idor.blocked';
  return 'api.unknown';
}

export function deriveResourceType(path: string): string | null {
  if (path.startsWith('/api/datasets')) return 'dataset';
  if (path.startsWith('/api/prompts')) return 'prompt';
  if (path.startsWith('/api/alerts/rules')) return 'alert_rule';
  if (path.startsWith('/api/alerts')) return 'alert_event';
  if (path.startsWith('/api/traces')) return 'trace';
  if (path.startsWith('/api/projects')) return 'project';
  return null;
}

export function extractResourceId(path: string): string | null {
  const resourceTypes = ['datasets', 'prompts', 'rules', 'traces', 'projects'];
  for (const rt of resourceTypes) {
    const regex = new RegExp(`/${rt}/([^/]+)`);
    const match = path.match(regex);
    if (match) return match[1];
  }
  return null;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/server && pnpm vitest run tests/derive-action.test.ts`
Expected: 所有 18 个测试通过。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(m11): derive-action 纯函数 + 18 个单测"
```

---

## Task 3: EventBus 单例

**Files:**
- Create: `apps/server/src/modules/event-bus.ts`

- [ ] **Step 1: 创建 EventBus**

创建 `apps/server/src/modules/event-bus.ts`：

```typescript
import { EventEmitter } from 'node:events';
import type { TraceListItem } from '../repositories/trace-repository.js';
import type { AlertEvent } from '../repositories/alert-repository.js';
import type { AuditLog } from '../repositories/audit-repository.js';

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(200);

export type TraceCreatedEvent = { projectId: string; trace: TraceListItem };
export type AlertTriggeredEvent = { projectId: string; event: AlertEvent };
export type AuditLoggedEvent = { log: AuditLog };
```

- [ ] **Step 2: lint 检查**

Run: `cd apps/server && pnpm lint`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(m12): EventBus 单例 — SSE 事件总线"
```

---

## Task 4: onResponse 审计钩子 + emit

**Files:**
- Create: `apps/server/src/auth/register-audit-hook.ts`
- Create: `apps/server/tests/audit-hook.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/server/tests/audit-hook.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository, IProjectRepository, IScoreRepository,
  IDatasetRepository, IPromptRepository, IStatsRepository,
  IUserRepository, IAlertRepository, IAuditRepository,
  TraceListItem, TraceDetail, ProjectListItem,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';

process.env.JWT_SECRET = 'test-secret';
import { signToken } from '../src/auth/jwt.js';

async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
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
  const loggedEntries: any[] = [];
  const auditRepo: IAuditRepository = {
    async log(entry) {
      loggedEntries.push(entry);
      return { ...entry, id: 'a1', createdAt: new Date() } as any;
    },
    async list() { return { logs: [], nextCursor: null }; },
  };
  const alertEvaluator = { evaluate: async () => {}, testWebhook: async () => false } as unknown as AlertEvaluator;
  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, auditRepo, alertEvaluator, __logged: loggedEntries };
}

describe('审计 onResponse 钩子', () => {
  it('GET 成功不记录审计', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    await app.inject({ method: 'GET', url: '/api/projects', headers: await authHeaders() });
    expect(deps.__logged.length).toBe(0);
  });

  it('POST login 成功记录 auth.login.success', async () => {
    const deps = makeMockDeps();
    deps.userRepo.findByEmail = async () => ({ id: 'u1', email: 'test@oat.dev', passwordHash: '$argon2id$mock', role: 'admin', createdAt: new Date(), updatedAt: new Date() });
    const app: FastifyInstance = await buildApp(deps);
    await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'test@oat.dev', password: 'x' },
    });
    expect(deps.__logged.length).toBe(1);
    expect(deps.__logged[0].action).toBe('auth.login.success');
  });

  it('POST login 失败记录 auth.login.failed', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'nope@oat.dev', password: 'x' },
    });
    expect(deps.__logged.length).toBe(1);
    expect(deps.__logged[0].action).toBe('auth.login.failed');
    expect(deps.__logged[0].statusCode).toBe(401);
  });

  it('GET /api/traces 404 记录 idor.blocked', async () => {
    const deps = makeMockDeps();
    deps.projectRepo.exists = async () => false;
    const app: FastifyInstance = await buildApp(deps);
    await app.inject({
      method: 'GET',
      url: '/api/traces?projectId=11111111-1111-1111-1111-111111111111',
      headers: await authHeaders(),
    });
    expect(deps.__logged.length).toBe(1);
    expect(deps.__logged[0].action).toBe('idor.blocked');
  });

  it('/health 不记录', async () => {
    const deps = makeMockDeps();
    const app: FastifyInstance = await buildApp(deps);
    await app.inject({ method: 'GET', url: '/health' });
    expect(deps.__logged.length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/server && pnpm vitest run tests/audit-hook.test.ts`
Expected: FAIL — buildApp 不接受 auditRepo。

- [ ] **Step 3: 实现 onResponse 钩子**

创建 `apps/server/src/auth/register-audit-hook.ts`：

```typescript
import type { FastifyInstance } from 'fastify';
import type { IAuditRepository } from '../repositories/audit-repository.js';
import { deriveAction, deriveResourceType, extractResourceId } from '../modules/derive-action.js';
import { eventBus } from '../modules/event-bus.js';

declare module 'fastify' {
  interface FastifyRequest {
    __startTime?: number;
  }
}

export function registerAuditHook(app: FastifyInstance, auditRepo: IAuditRepository) {
  app.addHook('onRequest', async (req) => {
    req.__startTime = Date.now();
  });

  app.addHook('onResponse', async (req, reply) => {
    const path = req.url.split('?')[0];
    const method = req.method;
    const status = reply.statusCode;

    if (path === '/health') return;
    if (!path.startsWith('/api/')) return;

    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const isError = status >= 400;
    if (!isMutation && !isError) return;

    const action = deriveAction(method, path, status);
    const projectId = (req.query as { projectId?: string })?.projectId
      ?? (req.body as { projectId?: string } | null)?.projectId
      ?? null;

    const duration = req.__startTime ? Date.now() - req.__startTime : null;

    try {
      const log = await auditRepo.log({
        actorEmail: req.user?.email ?? null,
        actorIp: req.ip,
        action,
        method,
        path,
        resourceType: deriveResourceType(path),
        resourceId: extractResourceId(path),
        projectId: projectId ?? null,
        statusCode: status,
        durationMs: duration,
        metadata: {},
      });
      eventBus.emit('audit:logged', { log });
    } catch {
      // 审计日志写入失败不应影响请求响应
    }
  });
}
```

- [ ] **Step 4: 更新 AppDeps 和 app.ts**

在 `apps/server/src/app.ts` 中：

1. 在 import 区追加：
```typescript
import type { IAuditRepository } from './repositories/audit-repository.js';
import { registerAuditHook } from './auth/register-audit-hook.js';
```

2. 在 `AppDeps` 接口中 `alertEvaluator` 之后追加：
```typescript
  auditRepo: IAuditRepository;
```

3. 在 `registerProjectAccessHook(app, deps.projectRepo);` 之后追加：
```typescript
  registerAuditHook(app, deps.auditRepo);
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd apps/server && pnpm vitest run tests/audit-hook.test.ts`
Expected: 5 个测试全部通过。

- [ ] **Step 6: 修复其他测试的 mock（加 auditRepo）**

在以下测试文件的 `makeMockDeps` 函数中追加 `auditRepo` mock：

`apps/server/tests/idor.test.ts`、`apps/server/tests/projects-api.test.ts`、`apps/server/tests/rate-limit.test.ts`：

在 `alertEvaluator` 行之后追加：
```typescript
  const auditRepo: IAuditRepository = {
    async log(entry) { return { ...entry, id: 'a1', createdAt: new Date() } as any; },
    async list() { return { logs: [], nextCursor: null }; },
  };
```

并在返回对象中追加 `auditRepo,`。同时在 import 中追加 `IAuditRepository`。

- [ ] **Step 7: 运行全部测试**

Run: `cd apps/server && pnpm test`
Expected: 所有测试通过（含原有 idor/projects-api/rate-limit + 新增 derive-action/audit-hook）。

- [ ] **Step 8: 更新 server.ts 注入 PostgresAuditRepository**

在 `apps/server/src/server.ts` 中：

1. 追加 import：
```typescript
import { PostgresAuditRepository } from './repositories/audit-repository.js';
```

2. 在构建 deps 对象中追加 `auditRepo`：
```typescript
  auditRepo: new PostgresAuditRepository(),
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(m11): onResponse 审计钩子 + AppDeps 集成"
```

---

## Task 5: GET /api/audit/logs 路由

**Files:**
- Create: `apps/server/src/routes/audit.ts`
- Create: `apps/server/tests/audit-api.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/server/tests/audit-api.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository, IProjectRepository, IScoreRepository,
  IDatasetRepository, IPromptRepository, IStatsRepository,
  IUserRepository, IAlertRepository, IAuditRepository,
  TraceListItem, TraceDetail, ProjectListItem, AuditLog,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';

process.env.JWT_SECRET = 'test-secret';
import { signToken } from '../src/auth/jwt.js';

async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
}

function makeMockDeps(mockLogs: AuditLog[]) {
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
    async list(params) {
      let logs = mockLogs;
      if (params.action) logs = logs.filter(l => l.action === params.action);
      if (params.projectId) logs = logs.filter(l => l.projectId === params.projectId);
      const limit = params.limit ?? 50;
      const sliced = logs.slice(0, limit);
      return { logs: sliced, nextCursor: logs.length > limit ? sliced[sliced.length - 1]?.createdAt.toISOString() ?? null : null };
    },
  };
  const alertEvaluator = { evaluate: async () => {}, testWebhook: async () => false } as unknown as AlertEvaluator;
  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, auditRepo, alertEvaluator };
}

const mockLog: AuditLog = {
  id: 'a1', createdAt: new Date('2026-07-13T12:00:00Z'),
  actorEmail: 'admin@oat.dev', actorIp: '127.0.0.1',
  action: 'ingestion', method: 'POST', path: '/api/public/ingestion',
  resourceType: null, resourceId: null, projectId: 'p1',
  statusCode: 200, durationMs: 5, metadata: {},
};

describe('GET /api/audit/logs', () => {
  it('未认证返回 401', async () => {
    const app = await buildApp(makeMockDeps([]));
    const res = await app.inject({ method: 'GET', url: '/api/audit/logs' });
    expect(res.statusCode).toBe(401);
  });

  it('认证后返回日志列表', async () => {
    const app = await buildApp(makeMockDeps([mockLog]));
    const res = await app.inject({
      method: 'GET', url: '/api/audit/logs',
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].action).toBe('ingestion');
    expect(body.nextCursor).toBeNull();
  });

  it('action 筛选', async () => {
    const app = await buildApp(makeMockDeps([mockLog]));
    const res = await app.inject({
      method: 'GET', url: '/api/audit/logs?action=auth.login.success',
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.logs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/server && pnpm vitest run tests/audit-api.test.ts`
Expected: FAIL — 路由不存在（404）。

- [ ] **Step 3: 实现 audit 路由**

创建 `apps/server/src/routes/audit.ts`：

```typescript
import type { FastifyPluginAsync } from 'fastify';
import type { IAuditRepository } from '../repositories/audit-repository.js';

export function buildAuditRoutes(deps: { auditRepo: IAuditRepository }): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/audit/logs', async (req, reply) => {
      const { projectId, action, actor, from, to, cursor, limit } = req.query as {
        projectId?: string;
        action?: string;
        actor?: string;
        from?: string;
        to?: string;
        cursor?: string;
        limit?: string;
      };
      const result = await deps.auditRepo.list({
        projectId: projectId ?? undefined,
        action: action ?? undefined,
        actorEmail: actor ?? undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        cursor: cursor ?? undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return result;
    });
  };
}
```

- [ ] **Step 4: 在 app.ts 注册路由**

在 `apps/server/src/app.ts` 中：

1. 追加 import：
```typescript
import { buildAuditRoutes } from './routes/audit.js';
```

2. 在 `await app.register(buildProjectRoutes(deps));` 之后追加：
```typescript
  await app.register(buildAuditRoutes(deps));
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd apps/server && pnpm vitest run tests/audit-api.test.ts`
Expected: 3 个测试全部通过。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(m11): GET /api/audit/logs 路由 + 筛选 + cursor 分页"
```

---

## Task 6: Traces cursor 分页改造

**Files:**
- Modify: `apps/server/src/repositories/trace-repository.ts`
- Modify: `apps/server/src/routes/traces.ts`
- Create: `apps/server/tests/trace-cursor.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/server/tests/trace-cursor.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository, IProjectRepository, IScoreRepository,
  IDatasetRepository, IPromptRepository, IStatsRepository,
  IUserRepository, IAlertRepository, IAuditRepository,
  TraceListItem, TraceDetail, ProjectListItem,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';

process.env.JWT_SECRET = 'test-secret';
import { signToken } from '../src/auth/jwt.js';

async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
}

function makeMockTraces(): TraceListItem[] {
  const traces: TraceListItem[] = [];
  for (let i = 0; i < 25; i++) {
    traces.push({
      id: `t${i}`,
      name: `trace-${i}`,
      userId: null,
      sessionId: null,
      timestamp: new Date(`2026-07-13T${String(12 - i).padStart(2, '0')}:00:00Z`),
    });
  }
  return traces;
}

function makeMockDeps(traces: TraceListItem[]) {
  const traceRepo: ITraceRepository = {
    async listTraces(projectId, limit, cursor?): Promise<TraceListItem[]> {
      let filtered = traces;
      if (cursor) filtered = traces.filter(t => t.timestamp < new Date(cursor));
      return filtered.slice(0, limit);
    },
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

describe('Traces cursor 分页', () => {
  it('第一页返回 nextCursor', async () => {
    const traces = makeMockTraces();
    const app: FastifyInstance = await buildApp(makeMockDeps(traces));
    const res = await app.inject({
      method: 'GET',
      url: '/api/traces?projectId=00000000-0000-0000-0000-000000000000&limit=10',
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.traces).toHaveLength(10);
    expect(body.nextCursor).not.toBeNull();
  });

  it('用 cursor 取第二页，数据不重叠', async () => {
    const traces = makeMockTraces();
    const app: FastifyInstance = await buildApp(makeMockDeps(traces));
    const res1 = await app.inject({
      method: 'GET',
      url: '/api/traces?projectId=00000000-0000-0000-0000-000000000000&limit=10',
      headers: await authHeaders(),
    });
    const body1 = res1.json();
    const cursor = body1.nextCursor;
    const res2 = await app.inject({
      method: 'GET',
      url: `/api/traces?projectId=00000000-0000-0000-0000-000000000000&limit=10&cursor=${encodeURIComponent(cursor)}`,
      headers: await authHeaders(),
    });
    const body2 = res2.json();
    const ids1 = new Set(body1.traces.map((t: any) => t.id));
    const ids2 = new Set(body2.traces.map((t: any) => t.id));
    for (const id of ids2) {
      expect(ids1.has(id)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/server && pnpm vitest run tests/trace-cursor.test.ts`
Expected: FAIL — listTraces 不接受 cursor 参数。

- [ ] **Step 3: 改造 trace-repository.ts**

在 `apps/server/src/repositories/trace-repository.ts` 中：

1. 修改接口签名（加 cursor）：
```typescript
export interface ITraceRepository {
  listTraces(projectId: string, limit: number, cursor?: string): Promise<TraceListItem[]>;
  getTraceDetail(traceId: string): Promise<TraceDetail | null>;
  createTraceWithObservations(trace: NewTrace, observations: Observation[]): Promise<void>;
}
```

2. 修改 PostgresTraceRepository.listTraces 实现：
```typescript
  async listTraces(projectId: string, limit = 50, cursor?: string): Promise<TraceListItem[]> {
    const conditions = [eq(schema.traces.projectId, projectId)];
    if (cursor) {
      conditions.push(lt(schema.traces.timestamp, new Date(cursor)));
    }
    const rows = await db
      .select({
        id: schema.traces.id,
        name: schema.traces.name,
        userId: schema.traces.userId,
        sessionId: schema.traces.sessionId,
        timestamp: schema.traces.timestamp,
      })
      .from(schema.traces)
      .where(and(...conditions))
      .orderBy(desc(schema.traces.timestamp))
      .limit(limit);
    return rows;
  }
```

3. 追加 import：
```typescript
import { eq, desc, lt, and } from 'drizzle-orm';
```

- [ ] **Step 4: 改造 traces 路由（加 nextCursor）**

修改 `apps/server/src/routes/traces.ts`：

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ITraceRepository } from '../repositories/trace-repository.js';

const querySchema = z.object({
  projectId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export function buildTracesRoutes(deps: { traceRepo: ITraceRepository }): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/traces', async (req, reply) => {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      const { projectId, limit, cursor } = parsed.data;
      const traces = await deps.traceRepo.listTraces(projectId, limit + 1, cursor);
      const hasMore = traces.length > limit;
      const pageTraces = hasMore ? traces.slice(0, limit) : traces;
      const nextCursor = hasMore && pageTraces.length > 0
        ? pageTraces[pageTraces.length - 1].timestamp.toISOString()
        : null;
      return { traces: pageTraces, nextCursor };
    });
  };
}
```

- [ ] **Step 5: 更新已有测试 mock 签名**

在 `apps/server/tests/idor.test.ts` 和 `apps/server/tests/projects-api.test.ts` 的 mock `traceRepo.listTraces` 签名改为：

```typescript
async listTraces(): Promise<TraceListItem[]> { return []; },
```

（保持不变——`cursor` 是可选参数，不传也兼容）

检查 `apps/server/tests/ingestion-api.test.ts` 和 `apps/server/tests/trace-repository.test.ts` 是否也需要更新签名。如果有 `listTraces` mock，确保参数兼容（已有 mock 不传 cursor 就行，TypeScript 可选参数兼容）。

- [ ] **Step 6: 运行测试确认通过**

Run: `cd apps/server && pnpm vitest run tests/trace-cursor.test.ts`
Expected: 2 个测试通过。

- [ ] **Step 7: 运行全部测试**

Run: `cd apps/server && pnpm test`
Expected: 所有测试通过。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(m12): Traces cursor 分页改造（API + repo）"
```

---

## Task 7: IngestionService + AlertEvaluator emit 事件

**Files:**
- Modify: `apps/server/src/modules/ingestion-service.ts`
- Modify: `apps/server/src/modules/alert-evaluator.ts`

- [ ] **Step 1: 修改 IngestionService — emit trace:created**

在 `apps/server/src/modules/ingestion-service.ts` 中：

1. 追加 import：
```typescript
import { eventBus } from './event-bus.js';
```

2. 在 `for (const [traceId, obs] of grouped)` 循环内 `await this.traceRepo.createTraceWithObservations(...)` 之后追加 emit。整个 for 循环体改为：

```typescript
    for (const [traceId, obs] of grouped) {
      const name = obs.find((o) => o.parentId == null)?.name ?? `trace-${traceId}`;
      await this.traceRepo.createTraceWithObservations(
        {
          projectId,
          name,
          userId: obs[0]?.userId ?? null,
          sessionId: obs[0]?.sessionId ?? null,
          input: obs[0]?.input,
          output: obs.find((o) => o.parentId == null)?.output,
          metadata: obs[0]?.metadata,
        },
        obs,
      );
      eventBus.emit('trace:created', {
        projectId,
        trace: {
          id: traceId,
          name,
          userId: obs[0]?.userId ?? null,
          sessionId: obs[0]?.sessionId ?? null,
          timestamp: new Date(),
        },
      });
    }
```

- [ ] **Step 2: 修改 AlertEvaluator — emit alert:triggered**

在 `apps/server/src/modules/alert-evaluator.ts` 中：

1. 追加 import：
```typescript
import { eventBus } from './event-bus.js';
```

2. 在 `await this.repo.createEvent({...})` 调用后追加 emit。找到 `createEvent` 调用：

```typescript
        await this.repo.createEvent({
          ruleId: rule.id,
          projectId: rule.projectId,
          metricValue,
          threshold,
          notificationStatus,
        });
```

在其后追加：

```typescript
        eventBus.emit('alert:triggered', {
          projectId: rule.projectId,
          event: {
            id: crypto.randomUUID(),
            ruleId: rule.id,
            projectId: rule.projectId,
            metricValue: metricValue.toString(),
            threshold: threshold.toString(),
            triggeredAt: new Date(),
            resolvedAt: null,
            notificationStatus,
          },
        });
```

3. 追加 import：
```typescript
import { randomUUID as cryptoRandomUUID } from 'node:crypto';
```
（然后用 `cryptoRandomUUID()` 替换 `crypto.randomUUID()`）

- [ ] **Step 3: lint 检查**

Run: `cd apps/server && pnpm lint`
Expected: 无错误。

- [ ] **Step 4: 运行全部测试**

Run: `cd apps/server && pnpm test`
Expected: 所有测试通过（emit 不影响已有逻辑）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(m12): IngestionService + AlertEvaluator emit 事件"
```

---

## Task 8: SSE 端点 + 单测

**Files:**
- Create: `apps/server/src/routes/stream.ts`
- Create: `apps/server/tests/stream.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/server/tests/stream.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
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

async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
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

describe('SSE 端点', () => {
  it('GET /api/stream/traces 返回 text/event-stream', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps());
    const res = await app.inject({
      method: 'GET',
      url: '/api/stream/traces?projectId=p1',
      headers: await authHeaders(),
    });
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('trace:created 事件推送到 SSE 流', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps());
    const res = await app.inject({
      method: 'GET',
      url: '/api/stream/traces?projectId=p1',
      headers: await authHeaders(),
    });
    eventBus.emit('trace:created', {
      projectId: 'p1',
      trace: { id: 't1', name: 'test', userId: null, sessionId: null, timestamp: new Date() },
    });
    expect(res.payload).toContain('test');
  });

  it('不同 projectId 的事件不推送', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps());
    const res = await app.inject({
      method: 'GET',
      url: '/api/stream/traces?projectId=p1',
      headers: await authHeaders(),
    });
    eventBus.emit('trace:created', {
      projectId: 'p2',
      trace: { id: 't2', name: 'other-project-trace', userId: null, sessionId: null, timestamp: new Date() },
    });
    expect(res.payload).not.toContain('other-project-trace');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/server && pnpm vitest run tests/stream.test.ts`
Expected: FAIL — 路由不存在（404）。

- [ ] **Step 3: 实现 SSE 路由**

创建 `apps/server/src/routes/stream.ts`：

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { eventBus } from '../modules/event-bus.js';
import type { TraceListItem } from '../repositories/trace-repository.js';
import type { AlertEvent } from '../repositories/alert-repository.js';
import type { AuditLog } from '../repositories/audit-repository.js';

export function buildStreamRoutes(): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/stream/traces', {
      config: { rateLimit: false },
    }, async (req, reply) => {
      const { projectId } = req.query as { projectId?: string };
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const handler = (event: { projectId: string; trace: TraceListItem }) => {
        if (event.projectId !== projectId) return;
        reply.raw.write('data: ' + JSON.stringify(event.trace) + '\n\n');
      };
      eventBus.on('trace:created', handler);

      const heartbeat = setInterval(() => {
        try { reply.raw.write(': ping\n\n'); } catch {}
      }, 30000);

      req.raw.on('close', () => {
        eventBus.off('trace:created', handler);
        clearInterval(heartbeat);
      });
    });

    app.get('/api/stream/alert-events', {
      config: { rateLimit: false },
    }, async (req, reply) => {
      const { projectId } = req.query as { projectId?: string };
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const handler = (event: { projectId: string; event: AlertEvent }) => {
        if (event.projectId !== projectId) return;
        reply.raw.write('data: ' + JSON.stringify(event.event) + '\n\n');
      };
      eventBus.on('alert:triggered', handler);

      const heartbeat = setInterval(() => {
        try { reply.raw.write(': ping\n\n'); } catch {}
      }, 30000);

      req.raw.on('close', () => {
        eventBus.off('alert:triggered', handler);
        clearInterval(heartbeat);
      });
    });

    app.get('/api/stream/audit-logs', {
      config: { rateLimit: false },
    }, async (_req, reply) => {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const handler = (event: { log: AuditLog }) => {
        reply.raw.write('data: ' + JSON.stringify(event.log) + '\n\n');
      };
      eventBus.on('audit:logged', handler);

      const heartbeat = setInterval(() => {
        try { reply.raw.write(': ping\n\n'); } catch {}
      }, 30000);

      _req.raw.on('close', () => {
        eventBus.off('audit:logged', handler);
        clearInterval(heartbeat);
      });
    });
  };
}
```

- [ ] **Step 4: 在 app.ts 注册路由**

在 `apps/server/src/app.ts` 中：

1. 追加 import：
```typescript
import { buildStreamRoutes } from './routes/stream.js';
```

2. 在 `await app.register(buildAuditRoutes(deps));` 之后追加：
```typescript
  await app.register(buildStreamRoutes());
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd apps/server && pnpm vitest run tests/stream.test.ts`
Expected: 3 个测试通过。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(m12): SSE 端点 — traces/alert-events/audit-logs 三流"
```

---

## Task 9: 前端 /audit 页面 + Nav 链接

**Files:**
- Modify: `apps/web/src/lib/api.shared.ts`
- Modify: `apps/web/src/lib/api.server.ts`
- Modify: `apps/web/src/components/nav.tsx`
- Create: `apps/web/src/app/audit/page.tsx`
- Create: `apps/web/src/app/audit/AuditClient.tsx`

- [ ] **Step 1: 新增 AuditLog 类型**

在 `apps/web/src/lib/api.shared.ts` 中追加：

```typescript
export type AuditLog = {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  actorIp: string | null;
  action: string;
  method: string;
  path: string;
  resourceType: string | null;
  resourceId: string | null;
  projectId: string | null;
  statusCode: number;
  durationMs: number | null;
  metadata: Record<string, unknown>;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};
```

- [ ] **Step 2: 新增 listAuditLogs server 函数**

在 `apps/web/src/lib/api.server.ts` 中：

1. 追加 import `AuditLog`：
```typescript
import type {
  TraceListItem,
  TraceDetail,
  ScoreItem,
  DatasetListItem,
  PromptListItem,
  PromptDetail,
  PromptVersion,
  ProjectListItem,
  AuthUser,
  AuditLog,
} from './api.shared';
```

2. 修改 `listTraces` 返回 `{ traces, nextCursor }`：
```typescript
export async function listTraces(
  projectId: string,
  cursor?: string,
): Promise<{ traces: TraceListItem[]; nextCursor: string | null }> {
  const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
  return get(`/api/traces?projectId=${projectId}&limit=20${cursorParam}`);
}
```

3. 追加 `listAuditLogs`：
```typescript
export async function listAuditLogs(params: {
  projectId?: string;
  action?: string;
  actor?: string;
  cursor?: string;
}): Promise<{ logs: AuditLog[]; nextCursor: string | null }> {
  const sp = new URLSearchParams();
  if (params.projectId) sp.set('projectId', params.projectId);
  if (params.action) sp.set('action', params.action);
  if (params.actor) sp.set('actor', params.actor);
  if (params.cursor) sp.set('cursor', params.cursor);
  sp.set('limit', '50');
  return get(`/api/audit/logs?${sp.toString()}`);
}
```

- [ ] **Step 3: 新增 Nav 链接**

在 `apps/web/src/components/nav.tsx` 的链接数组中追加：

```typescript
{ href: '/audit', label: '审计' },
```

（放在 `/alerts` 之后）

- [ ] **Step 4: 创建 /audit SSR 首屏**

创建 `apps/web/src/app/audit/page.tsx`：

```typescript
import { getCurrentProjectId } from '@/lib/project-context';
import { listAuditLogs } from '@/lib/api.server';
import { AuditClient } from './AuditClient';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; action?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);
  const { logs, nextCursor } = await listAuditLogs({
    projectId: projectId !== 'all' ? projectId : undefined,
    action: resolved.action,
  });

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-2xl font-bold mb-6">审计日志</h1>
      <AuditClient
        initialLogs={logs}
        initialNextCursor={nextCursor}
        projectId={projectId !== 'all' ? projectId : undefined}
        initialAction={resolved.action}
      />
    </main>
  );
}
```

- [ ] **Step 5: 创建 AuditClient 客户端组件**

创建 `apps/web/src/app/audit/AuditClient.tsx`：

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AuditLog } from '@/lib/api.shared';

export function AuditClient({
  initialLogs,
  initialNextCursor,
  projectId,
  initialAction,
}: {
  initialLogs: AuditLog[];
  initialNextCursor: string | null;
  projectId?: string;
  initialAction?: string;
}) {
  const [logs, setLogs] = useState<AuditLog[]>(initialLogs);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (projectId) sp.set('projectId', projectId);
    const es = new EventSource(`/api/stream/audit-logs?${sp.toString()}`);
    es.onmessage = (e) => {
      try {
        const log: AuditLog = JSON.parse(e.data);
        setLogs((prev) => [log, ...prev].slice(0, 200));
      } catch {}
    };
    return () => es.close();
  }, [projectId]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (projectId) sp.set('projectId', projectId);
      if (initialAction) sp.set('action', initialAction);
      sp.set('cursor', nextCursor);
      sp.set('limit', '50');
      const res = await fetch(`/api/audit/logs?${sp.toString()}`, { credentials: 'include' });
      const data = await res.json();
      setLogs((prev) => [...prev, ...data.logs]);
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading, projectId, initialAction]);

  return (
    <div>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">时间</th>
              <th className="text-left px-4 py-2">操作者</th>
              <th className="text-left px-4 py-2">动作</th>
              <th className="text-left px-4 py-2">方法</th>
              <th className="text-left px-4 py-2">路径</th>
              <th className="text-left px-4 py-2">状态码</th>
              <th className="text-left px-4 py-2">耗时</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  暂无审计日志
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-500">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2">{log.actorEmail ?? '-'}</td>
                <td className="px-4 py-2 font-mono text-xs">{log.action}</td>
                <td className="px-4 py-2 font-mono text-xs">{log.method}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500">{log.path}</td>
                <td className="px-4 py-2">
                  <span className={log.statusCode >= 400 ? 'text-red-600' : 'text-green-600'}>
                    {log.statusCode}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {log.durationMs != null ? `${log.durationMs}ms` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: 更新首页 Traces 列表（cursor 分页适配）**

修改 `apps/web/src/app/page.tsx` 中 `listTraces` 调用，解构返回值：

```typescript
const { traces } = await listTraces(projectId);
```

（保持向后兼容，只需解构 traces 字段即可）

- [ ] **Step 7: lint 检查**

Run: `cd apps/web && pnpm lint`
Expected: 无错误。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(m11): 前端 /audit 页面 + Nav 链接 + SSE 实时"
```

---

## Task 10: Traces 列表 SSE + Alert SSE + verify 脚本

**Files:**
- Create: `apps/web/src/app/TracesClient.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/alerts/AlertClient.tsx`
- Create: `scripts/verify-m11-m12.sh`
- Modify: `docs/README.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: 创建 TracesClient 客户端组件**

创建 `apps/web/src/app/TracesClient.tsx`：

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TraceListItem } from '@/lib/api.shared';

export function TracesClient({
  initialTraces,
  initialNextCursor,
  projectId,
}: {
  initialTraces: TraceListItem[];
  initialNextCursor: string | null;
  projectId: string;
}) {
  const [traces, setTraces] = useState<TraceListItem[]>(initialTraces);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/api/stream/traces?projectId=${projectId}`);
    es.onmessage = (e) => {
      try {
        const trace: TraceListItem = JSON.parse(e.data);
        setTraces((prev) => [trace, ...prev].slice(0, 100));
      } catch {}
    };
    return () => es.close();
  }, [projectId]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/traces?projectId=${projectId}&limit=20&cursor=${encodeURIComponent(nextCursor)}`,
        { credentials: 'include' },
      );
      const data = await res.json();
      setTraces((prev) => [...prev, ...data.traces]);
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading, projectId]);

  return (
    <div>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">名称</th>
              <th className="text-left px-4 py-2">时间</th>
            </tr>
          </thead>
          <tbody>
            {traces.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-8 text-center text-gray-400">暂无 Trace</td></tr>
            )}
            {traces.map((t) => (
              <tr key={t.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">{t.name}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(t.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor && (
        <div className="mt-4 text-center">
          <button onClick={loadMore} disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {loading ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 修改首页使用 TracesClient**

修改 `apps/web/src/app/page.tsx`，将 traces 表格替换为 `<TracesClient>`：

```typescript
import { TracesClient } from './TracesClient';
// ...
const { traces, nextCursor } = await listTraces(projectId);
// ...
<TracesClient initialTraces={traces} initialNextCursor={nextCursor} projectId={projectId} />
```

- [ ] **Step 3: AlertClient 加 SSE**

在 `apps/web/src/app/alerts/AlertClient.tsx` 中追加 SSE 订阅。在组件函数体开头加：

```typescript
  useEffect(() => {
    const es = new EventSource(`/api/stream/alert-events?projectId=${projectId}`);
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev]);
      } catch {}
    };
    return () => es.close();
  }, [projectId]);
```

（需要 import `useEffect`，确保 `projectId` 从 props 或 URL 提取）

- [ ] **Step 4: lint 检查**

Run: `cd apps/web && pnpm lint`
Expected: 无错误。

- [ ] **Step 5: 创建 verify-m11-m12.sh**

创建 `scripts/verify-m11-m12.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

OAT_URL="${OAT_URL:-http://localhost:3001}"
OAT_EMAIL="${OAT_EMAIL:-admin@oat.dev}"
OAT_PASSWORD="${OAT_PASSWORD:-admin123}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "==> 1) 登录 → 审计日志记录 auth.login.success"
curl -s -c "$COOKIE_JAR" -o /dev/null \
  -X POST "$OAT_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OAT_EMAIL\",\"password\":\"$OAT_PASSWORD\"}"
COUNT=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/audit/logs?action=auth.login.success&limit=5" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);process.stdout.write(String(j.logs.length))})")
[ "$COUNT" -ge 1 ] || { echo "FAIL: 未找到 login 日志"; exit 1; }
echo "    OK ($COUNT 条)"

echo "==> 2) 错误密码 → 审计记录 auth.login.failed"
curl -s -o /dev/null -X POST "$OAT_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"nope@oat.dev","password":"x"}'
COUNT=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/audit/logs?action=auth.login.failed&limit=5" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);process.stdout.write(String(j.logs.length))})")
[ "$COUNT" -ge 1 ] || { echo "FAIL: 未找到 failed 日志"; exit 1; }
echo "    OK ($COUNT 条)"

echo "==> 3) Traces cursor 分页"
FIRST=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/traces?projectId=ae062967-574e-462c-b8d0-7ebcc7fee609&limit=5")
CURSOR=$(echo "$FIRST" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);process.stdout.write(j.nextCursor??'null')})")
[ "$CURSOR" != "null" ] || { echo "SKIP: 数据不足 5 条，无法测分页"; }
if [ "$CURSOR" != "null" ]; then
  SECOND=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/traces?projectId=ae062967-574e-462c-b8d0-7ebcc7fee609&limit=5&cursor=$(echo "$CURSOR" | python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read().strip()))')")
  OVERLAP=$(echo "$FIRST$SECOND" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const a=JSON.parse(d.substring(0,d.indexOf('}{')+1));
      const b=JSON.parse(d.substring(d.indexOf('}{')+1));
      const sa=new Set(a.traces.map(t=>t.id));
      const sb=new Set(b.traces.map(t=>t.id));
      const o=[...sa].filter(x=>sb.has(x));
      process.stdout.write(String(o.length));
    })")
  [ "$OVERLAP" = "0" ] || { echo "FAIL: 两页有 $OVERLAP 条重叠"; exit 1; }
  echo "    OK (无重叠)"
fi

echo "==> 4) SSE traces 流"
timeout 3 curl -s -N -b "$COOKIE_JAR" "$OAT_URL/api/stream/traces?projectId=ae062967-574e-462c-b8d0-7ebcc7fee609" 2>&1 | head -1 | grep -q '^:' || true
echo "    SSE 连接 OK（需触发 ingestion 才有数据推送）"

echo "==> 全部验证通过"
```

- [ ] **Step 6: 运行验证脚本**

Run: `chmod +x scripts/verify-m11-m12.sh && bash scripts/verify-m11-m12.sh`
Expected: 全部验证通过。

- [ ] **Step 7: 更新 README 三份文档**

在 `docs/README.md` 的路线图表中：
- M11 状态改为 ✅ 完成
- M12 状态改为 ✅ 完成
- 目录树新增 M11/M12 spec + plan 文件

在 `README.md` 和 `README.zh-CN.md` 的核心特性中新增 M11 审计日志 + M12 实时刷新章节；路线图新增 M11/M12 条目。

- [ ] **Step 8: Commit + Push**

```bash
git add -A
git commit -m "feat(m12): Traces SSE + cursor 分页前端 + Alert SSE + verify 脚本 + README"
git push origin main
```

---

## 完成检查清单

- [ ] M11: audit_logs 表 + 迁移已应用
- [ ] M11: derive-action 18 个单测通过
- [ ] M11: onResponse 钩子注册，5 个测试通过
- [ ] M11: GET /api/audit/logs + cursor 分页
- [ ] M11: 前端 /audit 页面 + SSE 实时
- [ ] M12: EventBus 单例
- [ ] M12: IngestionService + AlertEvaluator emit
- [ ] M12: SSE 三条流端点
- [ ] M12: Traces cursor 分页（API + repo + 前端）
- [ ] M12: AlertClient SSE
- [ ] verify-m11-m12.sh 全通过
- [ ] README 三份文档更新
- [ ] git push origin main