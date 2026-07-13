# M10 安全加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三项安全加固 — API Key SHA-256 哈希存储、IDOR 项目存在性校验、分层限流。

**Architecture:** API Key 改为破坏性哈希迁移（新增 `apiKeyHash` + `apiKeyPreview` 列，删除明文 `apiKey` 列）。IDOR 通过独立 preHandler 钩子校验 projectId 存在性。限流用 `@fastify/rate-limit` 内存存储，全局 100/min + 路由级覆盖。

**Tech Stack:** Fastify v4、`@fastify/rate-limit` v9、drizzle-orm、node:crypto（SHA-256）、vitest。

**Spec:** `docs/specs/2026-07-13-m10-security-hardening-design.md`

---

## File Structure

| 文件 | 操作 | 责任 |
|------|------|------|
| `apps/server/src/modules/api-key.ts` | 新建 | `generateApiKey()` + `hashApiKey()` |
| `apps/server/tests/api-key.test.ts` | 新建 | api-key 模块单测 |
| `apps/server/src/db/schema.ts` | 修改 | projects 表：删 `apiKey`，加 `apiKeyHash` + `apiKeyPreview` |
| `apps/server/drizzle/0005_*.sql` | 新建（生成） | drizzle-kit 自动生成的迁移 |
| `apps/server/src/repositories/project-repository.ts` | 修改 | `findByApiKey` 改哈希比对；加 `exists`；`listAll` 改返 preview；`ProjectListItem` 改字段 |
| `scripts/seed.ts` | 修改 | 用 `generateApiKey` 生成随机 key，打印明文一次 |
| `apps/server/tests/projects-api.test.ts` | 修改 | mock 适配新接口（`apiKeyPreview` + `exists`） |
| `apps/server/tests/ingestion-api.test.ts` | 修改 | mock 加 `exists` |
| `apps/server/tests/trace-repository.test.ts` | 修改 | 集成测试改用 `listAll` 而非 `findByApiKey('demo-api-key')` |
| `apps/web/src/lib/api.shared.ts` | 修改 | `ProjectListItem.apiKey` → `apiKeyPreview`；`handleResponse` 加 429 |
| `apps/server/src/auth/require-project.ts` | 新建 | IDOR preHandler |
| `apps/server/src/app.ts` | 修改 | 注册 rate-limit + registerProjectAccessHook |
| `apps/server/src/routes/auth.ts` | 修改 | login 路由加 per-route 限流 config |
| `apps/server/src/routes/ingestion.ts` | 修改 | ingestion 路由加 per-route 限流 config |
| `apps/server/tests/idor.test.ts` | 新建 | IDOR preHandler 测试 |
| `apps/server/tests/rate-limit.test.ts` | 新建 | 限流阈值测试 |
| `scripts/verify-m10.sh` | 新建 | 端到端验证脚本 |

---

## Task 1: API Key 模块（TDD）

**Files:**
- Create: `apps/server/src/modules/api-key.ts`
- Create: `apps/server/tests/api-key.test.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/server/tests/api-key.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey } from '../src/modules/api-key.js';

describe('api-key module', () => {
  it('generateApiKey 返回 raw 以 oat_ 开头', () => {
    const { raw } = generateApiKey();
    expect(raw.startsWith('oat_')).toBe(true);
  });

  it('generateApiKey 返回的 raw 有足够熵（oat_ + 至少 32 hex 字符）', () => {
    const { raw } = generateApiKey();
    expect(raw.length).toBeGreaterThanOrEqual(36); // oat_ (4) + 32+ hex
  });

  it('generateApiKey 返回的 hash 是 64 位 hex（SHA-256）', () => {
    const { hash } = generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashApiKey(raw) 等于 generateApiKey 返回的 hash', () => {
    const { raw, hash } = generateApiKey();
    expect(hashApiKey(raw)).toBe(hash);
  });

  it('generateApiKey 返回的 preview 是 raw 后 4 位', () => {
    const { raw, preview } = generateApiKey();
    expect(raw.endsWith(preview)).toBe(true);
    expect(preview.length).toBe(4);
  });

  it('两次调用 generateApiKey 返回不同的 raw', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server && pnpm test -- api-key
```

Expected: FAIL — 模块不存在，import 报错。

- [ ] **Step 3: 写最小实现**

Create `apps/server/src/modules/api-key.ts`:

```typescript
import { createHash, randomBytes } from 'node:crypto';

const PREFIX = 'oat_';

export function generateApiKey(): { raw: string; hash: string; preview: string } {
  const raw = PREFIX + randomBytes(24).toString('hex');
  return {
    raw,
    hash: hashApiKey(raw),
    preview: raw.slice(-4),
  };
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/server && pnpm test -- api-key
```

Expected: PASS — 全部 6 个测试通过。

- [ ] **Step 5: typecheck**

```bash
cd apps/server && pnpm lint
```

Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/modules/api-key.ts apps/server/tests/api-key.test.ts
git commit -m "feat(server): add api-key module with SHA-256 hashing"
```

---

## Task 2: Schema 变更 + ProjectRepository + seed + mock 更新

**Files:**
- Modify: `apps/server/src/db/schema.ts:11-18`（projects 表）
- Modify: `apps/server/src/repositories/project-repository.ts`（整体）
- Modify: `scripts/seed.ts`
- Generate: `apps/server/drizzle/0005_*.sql`
- Modify: `apps/server/tests/projects-api.test.ts`
- Modify: `apps/server/tests/ingestion-api.test.ts`
- Modify: `apps/server/tests/trace-repository.test.ts`

- [ ] **Step 1: 修改 schema.ts — projects 表字段替换**

`apps/server/src/db/schema.ts` 第 11-18 行，把 `apiKey` 改为 `apiKeyHash` + `apiKeyPreview`：

旧代码：
```typescript
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  apiKey: text('api_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

新代码：
```typescript
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  apiKeyPreview: text('api_key_preview').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: 生成 drizzle 迁移**

```bash
cd apps/server && pnpm db:generate
```

Expected: 生成 `apps/server/drizzle/0005_*.sql`（文件名由 drizzle-kit 决定，通常是 `0005_random_word.sql`）。检查生成的 SQL 包含 `ALTER TABLE "projects" DROP COLUMN "api_key"` 和 `ADD COLUMN "api_key_hash"` / `"api_key_preview"`。

- [ ] **Step 3: 修改 project-repository.ts — 接口 + 实现**

整体替换 `apps/server/src/repositories/project-repository.ts`：

```typescript
import { db, schema } from '../db/client.js';
import { eq, desc } from 'drizzle-orm';
import { hashApiKey } from '../modules/api-key.js';

export type ProjectListItem = {
  id: string;
  name: string;
  apiKeyPreview: string;
  createdAt: Date;
};

export interface IProjectRepository {
  findByApiKey(rawApiKey: string): Promise<{ id: string; name: string } | null>;
  listAll(): Promise<ProjectListItem[]>;
  exists(projectId: string): Promise<boolean>;
}

export class PostgresProjectRepository implements IProjectRepository {
  async findByApiKey(rawApiKey: string) {
    const hash = hashApiKey(rawApiKey);
    const [row] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(eq(schema.projects.apiKeyHash, hash));
    return row ?? null;
  }

  async listAll(): Promise<ProjectListItem[]> {
    return db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        apiKeyPreview: schema.projects.apiKeyPreview,
        createdAt: schema.projects.createdAt,
      })
      .from(schema.projects)
      .orderBy(desc(schema.projects.createdAt));
  }

  async exists(projectId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);
    return !!row;
  }
}
```

- [ ] **Step 4: 修改 seed.ts — 用 generateApiKey**

替换 `scripts/seed.ts`：

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { projects } from '../apps/server/src/db/schema.js';
import { generateApiKey } from '../apps/server/src/modules/api-key.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '../apps/server/drizzle');

const url = process.env.DATABASE_URL!;
const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

async function main() {
  await migrate(db, { migrationsFolder });

  const { raw, hash, preview } = generateApiKey();
  const [proj] = await db
    .insert(projects)
    .values({ name: 'Demo Project', slug: 'demo', apiKeyHash: hash, apiKeyPreview: preview })
    .onConflictDoUpdate({
      target: projects.slug,
      set: { apiKeyHash: hash, apiKeyPreview: preview },
    })
    .returning();

  console.log(JSON.stringify({ projectId: proj.id, apiKey: raw }));
  await sql.end();
}

main();
```

- [ ] **Step 5: 更新 projects-api.test.ts mock**

`apps/server/tests/projects-api.test.ts`，修改 `mockProject` 和 `projectRepo` mock：

旧 `mockProject`（第 30-35 行）：
```typescript
const mockProject: ProjectListItem = {
  id: 'p1',
  name: 'demo',
  apiKey: 'demo-key',
  createdAt: new Date('2026-01-01'),
};
```

新：
```typescript
const mockProject: ProjectListItem = {
  id: 'p1',
  name: 'demo',
  apiKeyPreview: 'abcd',
  createdAt: new Date('2026-01-01'),
};
```

旧 `projectRepo` mock（第 44-47 行）：
```typescript
  const projectRepo: IProjectRepository = {
    async findByApiKey() { return null; },
    async listAll() { return [mockProject]; },
  };
```

新（加 `exists`）：
```typescript
  const projectRepo: IProjectRepository = {
    async findByApiKey() { return null; },
    async listAll() { return [mockProject]; },
    async exists() { return true; },
  };
```

旧断言（第 114-118 行）：
```typescript
    expect(body.projects[0]).toMatchObject({
      id: 'p1',
      name: 'demo',
      apiKey: 'demo-key',
    });
```

新：
```typescript
    expect(body.projects[0]).toMatchObject({
      id: 'p1',
      name: 'demo',
      apiKeyPreview: 'abcd',
    });
```

- [ ] **Step 6: 更新 ingestion-api.test.ts mock — 加 exists**

`apps/server/tests/ingestion-api.test.ts`，第 37-42 行的 `projectRepo` mock：

旧：
```typescript
  const projectRepo: IProjectRepository = {
    async findByApiKey(key: string) {
      return key === 'valid-key' ? { id: 'proj-1', name: 'test' } : null;
    },
    async listAll() { return []; },
  };
```

新（加 `exists`）：
```typescript
  const projectRepo: IProjectRepository = {
    async findByApiKey(key: string) {
      return key === 'valid-key' ? { id: 'proj-1', name: 'test' } : null;
    },
    async listAll() { return []; },
    async exists() { return true; },
  };
```

- [ ] **Step 7: 更新 trace-repository.test.ts — 集成测试改用 listAll**

`apps/server/tests/trace-repository.test.ts` 中，旧代码（约第 12 行）用 `findByApiKey('demo-api-key')` 获取项目。改为用 `listAll` 取第一个：

旧（约第 7-14 行）：
```typescript
const projectRepo = new PostgresProjectRepository();

let project: { id: string; name: string } | null = null;
try {
  project = await projectRepo.findByApiKey('demo-api-key');
} catch {
  project = null;
}
```

新：
```typescript
const projectRepo = new PostgresProjectRepository();

let project: { id: string; name: string } | null = null;
try {
  const all = await projectRepo.listAll();
  project = all[0] ? { id: all[0].id, name: all[0].name } : null;
} catch {
  project = null;
}
```

- [ ] **Step 8: typecheck + 全部测试**

```bash
cd apps/server && pnpm lint && pnpm test
```

Expected: typecheck 通过（无 `apiKey` 残留引用）；全部测试通过（projects-api、ingestion-api、trace-repository 集成测试如无 DB 则 skip）。

- [ ] **Step 9: 提交**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/ apps/server/src/repositories/project-repository.ts scripts/seed.ts apps/server/tests/projects-api.test.ts apps/server/tests/ingestion-api.test.ts apps/server/tests/trace-repository.test.ts
git commit -m "feat(server): hash API keys with SHA-256, add exists() method

Breaking: apiKey column replaced by apiKeyHash + apiKeyPreview.
Re-run pnpm db:seed to get new raw key."
```

---

## Task 3: 前端类型兼容

**Files:**
- Modify: `apps/web/src/lib/api.shared.ts:158-163`（ProjectListItem）
- Modify: `apps/web/src/lib/api.shared.ts:171-192`（handleResponse）

- [ ] **Step 1: 修改 ProjectListItem 类型**

`apps/web/src/lib/api.shared.ts` 第 158-163 行：

旧：
```typescript
export type ProjectListItem = {
  id: string;
  name: string;
  apiKey: string;
  createdAt: string;
};
```

新：
```typescript
export type ProjectListItem = {
  id: string;
  name: string;
  apiKeyPreview: string;
  createdAt: string;
};
```

- [ ] **Step 2: handleResponse 加 429 分支**

`apps/web/src/lib/api.shared.ts` 的 `handleResponse` 函数，在 `if (!res.ok)` 之前加 429 分支。

旧（第 182 行 `if (!res.ok)` 前面）：
```typescript
  if (!res.ok) {
```

新（在 `if (!res.ok)` 前面插入）：
```typescript
  if (res.status === 429) {
    throw new Error('请求过于频繁，请稍后再试');
  }
  if (!res.ok) {
```

- [ ] **Step 3: typecheck**

```bash
cd apps/web && pnpm lint
```

Expected: 无错误（M9 的 ProjectSwitcher/Nav 不引用 apiKey 字段，无破坏）。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/lib/api.shared.ts
git commit -m "feat(web): adapt ProjectListItem to apiKeyPreview + add 429 handling"
```

---

## Task 4: IDOR preHandler

**Files:**
- Create: `apps/server/src/auth/require-project.ts`
- Modify: `apps/server/src/app.ts`（注册 hook）
- Create: `apps/server/tests/idor.test.ts`

- [ ] **Step 1: 写 IDOR hook 模块**

Create `apps/server/src/auth/require-project.ts`:

```typescript
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
```

- [ ] **Step 2: 在 app.ts 注册 hook**

`apps/server/src/app.ts`，在 `registerAuthHook(app)` 之后注册 IDOR hook。

旧（第 69-71 行）：
```typescript
  registerAuthHook(app);

  return app;
```

新（加 import 和调用）：

先在文件顶部 import 区加（第 15 行 `registerAuthHook` import 后面）：
```typescript
import { registerProjectAccessHook } from './auth/require-project.js';
```

再把注册部分改为：
```typescript
  registerAuthHook(app);
  registerProjectAccessHook(app, deps.projectRepo);

  return app;
```

- [ ] **Step 3: 写 IDOR 测试**

Create `apps/server/tests/idor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository,
  IProjectRepository,
  IScoreRepository,
  IDatasetRepository,
  IPromptRepository,
  IStatsRepository,
  IUserRepository,
  IAlertRepository,
  TraceListItem,
  TraceDetail,
  ProjectListItem,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';

process.env.JWT_SECRET = 'test-secret';

import { signToken } from '../src/auth/jwt.js';

async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
}

const VALID_PROJECT_ID = '00000000-0000-0000-0000-000000000000';

function makeMockDeps(existsReturn: boolean) {
  const traceRepo: ITraceRepository = {
    async listTraces(): Promise<TraceListItem[]> { return []; },
    async getTraceDetail(): Promise<TraceDetail | null> { return null; },
    async createTraceWithObservations() {},
  };
  const mockProject: ProjectListItem = {
    id: VALID_PROJECT_ID,
    name: 'demo',
    apiKeyPreview: 'abcd',
    createdAt: new Date('2026-01-01'),
  };
  const projectRepo: IProjectRepository = {
    async findByApiKey() { return null; },
    async listAll() { return [mockProject]; },
    async exists() { return existsReturn; },
  };
  const scoreRepo: IScoreRepository = {
    async createScore() { return 's1'; },
    async listScoresByTrace() { return []; },
  };
  const datasetRepo: IDatasetRepository = {
    async createDataset() { return 'd1'; },
    async listDatasets() { return []; },
    async getDataset() { return null; },
    async addDatasetItem() { return 'i1'; },
    async listDatasetItems() { return []; },
  };
  const promptRepo: IPromptRepository = {
    async createPrompt() { return { promptId: 'p1', version: 1 }; },
    async listPrompts() { return []; },
    async getPrompt() { return null; },
    async getPromptByName() { return null; },
    async addVersion() { return 2; },
    async listVersions() { return []; },
  };
  const statsRepo: IStatsRepository = {
    async getOverview() {
      return {
        range: '24h', series: [],
        summary: { totalTraces: 0, totalTokens: 0, totalCost: '0', avgLatencyMs: null },
        topModels: [], scoreDistribution: [],
      };
    },
  };
  const userRepo: IUserRepository = {
    async findByEmail() { return null; },
    async create(email, passwordHash) {
      return { id: 'u1', email, passwordHash, role: 'admin', createdAt: new Date(), updatedAt: new Date() };
    },
  };
  const alertRepo: IAlertRepository = {
    async listRules() { return []; },
    async getRule() { return null; },
    async createRule() { throw new Error('not implemented'); },
    async updateRule() { return null; },
    async deleteRule() {},
    async listEvents() { return []; },
    async createEvent() {},
  };
  const alertEvaluator = { evaluate: async () => {}, testWebhook: async () => false } as unknown as AlertEvaluator;
  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, alertEvaluator };
}

describe('IDOR preHandler', () => {
  it('projectId 存在时返回 200', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps(true));
    const res = await app.inject({
      method: 'GET',
      url: `/api/traces?projectId=${VALID_PROJECT_ID}`,
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });

  it('projectId 不存在时返回 404', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps(false));
    const res = await app.inject({
      method: 'GET',
      url: '/api/traces?projectId=11111111-1111-1111-1111-111111111111',
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('不带 projectId 的路由不受影响', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps(false));
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 4: 运行测试**

```bash
cd apps/server && pnpm test -- idor
```

Expected: 3 个测试全部通过。

- [ ] **Step 5: 运行全部测试确认无回归**

```bash
cd apps/server && pnpm test
```

Expected: 全部通过（现有测试的 mock `exists` 返回 `true`，不影响）。

- [ ] **Step 6: typecheck**

```bash
cd apps/server && pnpm lint
```

Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add apps/server/src/auth/require-project.ts apps/server/src/app.ts apps/server/tests/idor.test.ts
git commit -m "feat(server): add IDOR preHandler to validate projectId existence"
```

---

## Task 5: 限流

**Files:**
- Modify: `apps/server/package.json`（加依赖）
- Modify: `apps/server/src/app.ts`（注册全局插件）
- Modify: `apps/server/src/routes/auth.ts`（login per-route 覆盖）
- Modify: `apps/server/src/routes/ingestion.ts`（ingestion per-route 覆盖）
- Create: `apps/server/tests/rate-limit.test.ts`

- [ ] **Step 1: 安装 @fastify/rate-limit**

```bash
pnpm --filter @oat/server add @fastify/rate-limit@^9
```

Expected: `package.json` 的 dependencies 增加 `"@fastify/rate-limit": "^9.x.x"`。

- [ ] **Step 2: app.ts 注册全局限流**

`apps/server/src/app.ts`，在 cookie 注册之后、路由注册之前插入限流注册。

旧（第 49-52 行）：
```typescript
  await app.register(cors, { origin: true, credentials: true }); // credentials:true 让前端 fetch 能带 cookie
  await app.register(cookie); // 解析 cookie，preHandler 和 logout 依赖它

  await app.register(healthRoutes);
```

新（在 cookie 之后加 rateLimit）：
先在文件顶部 import 区加（第 3 行 `import cookie` 后面）：
```typescript
import rateLimit from '@fastify/rate-limit';
```

再把注册部分改为：
```typescript
  await app.register(cors, { origin: true, credentials: true }); // credentials:true 让前端 fetch 能带 cookie
  await app.register(cookie); // 解析 cookie，preHandler 和 logout 依赖它
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(healthRoutes);
```

- [ ] **Step 3: auth.ts login 路由加 per-route 限流**

`apps/server/src/routes/auth.ts` 第 9 行，给 login 路由加 route options：

旧：
```typescript
    app.post('/api/auth/login', async (req, reply) => {
```

新：
```typescript
    app.post('/api/auth/login', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (req, reply) => {
```

- [ ] **Step 4: ingestion.ts 上报路由加 per-route 限流**

`apps/server/src/routes/ingestion.ts` 第 19 行，给 ingestion 路由加 route options：

旧：
```typescript
    app.post('/api/public/ingestion', async (req, reply) => {
```

新：
```typescript
    app.post('/api/public/ingestion', {
      config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
    }, async (req, reply) => {
```

- [ ] **Step 5: 写限流测试**

Create `apps/server/tests/rate-limit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type {
  ITraceRepository,
  IProjectRepository,
  IScoreRepository,
  IDatasetRepository,
  IPromptRepository,
  IStatsRepository,
  IUserRepository,
  IAlertRepository,
  TraceListItem,
  TraceDetail,
} from '../src/repositories/index.js';
import type { AlertEvaluator } from '../src/modules/alert-evaluator.js';

process.env.JWT_SECRET = 'test-secret';

function makeMockDeps() {
  const traceRepo: ITraceRepository = {
    async listTraces(): Promise<TraceListItem[]> { return []; },
    async getTraceDetail(): Promise<TraceDetail | null> { return null; },
    async createTraceWithObservations() {},
  };
  const projectRepo: IProjectRepository = {
    async findByApiKey() { return { id: 'proj-1', name: 'test' }; },
    async listAll() { return []; },
    async exists() { return true; },
  };
  const scoreRepo: IScoreRepository = {
    async createScore() { return 's1'; },
    async listScoresByTrace() { return []; },
  };
  const datasetRepo: IDatasetRepository = {
    async createDataset() { return 'd1'; },
    async listDatasets() { return []; },
    async getDataset() { return null; },
    async addDatasetItem() { return 'i1'; },
    async listDatasetItems() { return []; },
  };
  const promptRepo: IPromptRepository = {
    async createPrompt() { return { promptId: 'p1', version: 1 }; },
    async listPrompts() { return []; },
    async getPrompt() { return null; },
    async getPromptByName() { return null; },
    async addVersion() { return 2; },
    async listVersions() { return []; },
  };
  const statsRepo: IStatsRepository = {
    async getOverview() {
      return {
        range: '24h', series: [],
        summary: { totalTraces: 0, totalTokens: 0, totalCost: '0', avgLatencyMs: null },
        topModels: [], scoreDistribution: [],
      };
    },
  };
  const userRepo: IUserRepository = {
    async findByEmail() { return null; },
    async create(email, passwordHash) {
      return { id: 'u1', email, passwordHash, role: 'admin', createdAt: new Date(), updatedAt: new Date() };
    },
  };
  const alertRepo: IAlertRepository = {
    async listRules() { return []; },
    async getRule() { return null; },
    async createRule() { throw new Error('not implemented'); },
    async updateRule() { return null; },
    async deleteRule() {},
    async listEvents() { return []; },
    async createEvent() {},
  };
  const alertEvaluator = { evaluate: async () => {}, testWebhook: async () => false } as unknown as AlertEvaluator;
  return { traceRepo, projectRepo, scoreRepo, datasetRepo, promptRepo, statsRepo, userRepo, alertRepo, alertEvaluator };
}

describe('Rate limiting', () => {
  it('login 路由超 10 次/min 返回 429', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps());
    let res429 = null;
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'x@y.z', password: 'wrong' },
      });
      if (res.statusCode === 429) {
        res429 = res;
        break;
      }
    }
    expect(res429).not.toBeNull();
    expect(res429!.statusCode).toBe(429);
  });

  it('ingestion 路由超 600 次/min 返回 429', async () => {
    const app: FastifyInstance = await buildApp(makeMockDeps());
    let res429 = null;
    for (let i = 0; i < 601; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/public/ingestion',
        headers: { authorization: 'Bearer valid-key' },
        payload: { batch: [] },
      });
      if (res.statusCode === 429) {
        res429 = res;
        break;
      }
    }
    expect(res429).not.toBeNull();
    expect(res429!.statusCode).toBe(429);
  });
});
```

- [ ] **Step 6: 运行限流测试**

```bash
cd apps/server && pnpm test -- rate-limit
```

Expected: 2 个测试通过（login 第 11 次返回 429；ingestion 第 601 次返回 429）。

> **注意：** ingestion 测试发 601 次请求可能需要几秒。如果超时，在 `vitest.config.ts` 或测试 describe 上加 `timeout: 30000`。

- [ ] **Step 7: 全部测试 + typecheck**

```bash
cd apps/server && pnpm lint && pnpm test
```

Expected: 全部通过。

- [ ] **Step 8: 提交**

```bash
git add apps/server/package.json pnpm-lock.yaml apps/server/src/app.ts apps/server/src/routes/auth.ts apps/server/src/routes/ingestion.ts apps/server/tests/rate-limit.test.ts
git commit -m "feat(server): add @fastify/rate-limit with per-route overrides

Global 100/min, login 10/min, ingestion 600/min."
```

---

## Task 6: verify-m10.sh + README + 推送

**Files:**
- Create: `scripts/verify-m10.sh`
- Modify: `docs/README.md`

- [ ] **Step 1: 写验证脚本**

Create `scripts/verify-m10.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
EMAIL="${EMAIL:-admin@oat.dev}"
PASSWORD="${PASSWORD:-admin}"

echo "=== M10 安全加固验证 ==="

echo ""
echo "1. 老明文 key 'demo-api-key' 上报 ingestion → 应 401"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/public/ingestion" \
  -H "Authorization: Bearer demo-api-key" \
  -H "Content-Type: application/json" \
  -d '{"batch":[]}')
echo "   状态码: $STATUS (期望 401)"
[ "$STATUS" = "401" ] || { echo "   ❌ 失败"; exit 1; }

echo ""
echo "2. 不存在的 projectId 查 traces → 应 404"
# 先登录拿 cookie
COOKIE=$(curl -s -c - \
  -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | grep oat_session | awk '{print $7}')
STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  -X GET "$BASE_URL/api/traces?projectId=00000000-0000-0000-0000-999999999999" \
  -b "oat_session=$COOKIE")
echo "   状态码: $STATUS (期望 404)"
[ "$STATUS" = "404" ] || { echo "   ❌ 失败"; exit 1; }

echo ""
echo "3. 连续 11 次 login → 第 11 次应 429"
for i in $(seq 1 11); do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"wrong\"}")
  echo "   第 $i 次: $STATUS"
  if [ "$i" -eq 11 ]; then
    [ "$STATUS" = "429" ] || { echo "   ❌ 第 11 次期望 429"; exit 1; }
  fi
done

echo ""
echo "=== 全部通过 ✓ ==="
```

- [ ] **Step 2: 更新 README 里程碑表**

`docs/README.md`，把 M10 行从 `📋 规划中` 改为 `✅ 完成`，在 plans 表加 M10 plan 链接。

- [ ] **Step 3: 最终全量验证**

```bash
cd apps/server && pnpm lint && pnpm test
cd ../web && pnpm lint
```

Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add scripts/verify-m10.sh docs/README.md
git commit -m "chore: add verify-m10.sh + mark M10 complete in README"
```

- [ ] **Step 5: 推送**

```bash
git push origin main
```

---

## Self-Review Notes

- **Spec coverage:** §3.1 API Key 哈希 → Task 1+2；§3.2 IDOR → Task 4；§3.3 限流 → Task 5；§4.6 前端 → Task 3。全部覆盖。
- **Type consistency:** `ProjectListItem.apiKeyPreview` 在后端（Task 2）和前端（Task 3）一致；`exists(projectId): Promise<boolean>` 在接口（Task 2）和 IDOR hook（Task 4）一致；`generateApiKey()` 返回的 `{raw, hash, preview}` 在模块（Task 1）和 seed（Task 2）一致。
- **Hook 顺序：** rate-limit（onRequest）→ auth preHandler → IDOR preHandler。app.ts 中 rateLimit 在 cookie 之后注册（插件层），authHook + projectAccessHook 在路由之后注册（hook 层）。Fastify 保证 onRequest 先于 preHandler 执行。
- **测试不互相干扰：** 每个测试 `buildApp` 创建新实例，rate-limit 内存计数器随之重置。
