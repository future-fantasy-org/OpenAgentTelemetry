# M9 鉴权修复 + 前端骨架 + 项目选择器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复登录后 SSR 全 401、补齐登出 UI、抽共享 Nav、引入项目选择器、补 error/loading 边界，使"登录 → 切项目 → 看数据"闭环可用。

**Architecture:** 纯 SSR + URL 方案。后端新增 `GET /api/projects`；前端将 `lib/api.ts` 拆为 shared/server/client 三文件（server 文件用 `import 'server-only'` 防止 client bundle 引入 `next/headers`），cookie 通过 `next/headers` 的 `cookies()` 转发；项目选择以 `?projectId=xxx` URL query 为唯一状态源；root layout 用 middleware 转发的 `x-search` header 读 URL（layout 不接收 searchParams）；401 由 `handleResponse` 统一处理（server 抛 redirect、client 跳 `window.location`）；页面去掉 try/catch 让错误冒泡到 `error.tsx` 边界。

**Tech Stack:** Next.js 15 (App Router) / Fastify / drizzle-orm / vitest / TypeScript

**关联规格：** `docs/specs/2026-07-12-m9-auth-frontend-skeleton-design.md`

---

## File Structure

### 后端
| 文件 | 责任 |
|------|------|
| `apps/server/src/repositories/project-repository.ts` | 加 `listAll()` 方法 + `ProjectListItem` 类型 |
| `apps/server/src/routes/projects.ts` | **新建** — `GET /api/projects` 路由（闭包工厂） |
| `apps/server/src/app.ts` | 注册 projects 路由 |
| `apps/server/tests/projects-api.test.ts` | **新建** — projects API 测试（cookie 鉴权） |
| `apps/server/tests/ingestion-api.test.ts` | mock 加 `listAll` |

### 前端
| 文件 | 责任 |
|------|------|
| `apps/web/src/lib/api.shared.ts` | **新建** — 原 api.ts 全部类型 + handleResponse + isServer + API_BASE + 新 ProjectListItem |
| `apps/web/src/lib/api.server.ts` | **新建** — `import 'server-only'` + cookie 转发 + 服务端数据函数 |
| `apps/web/src/lib/api.client.ts` | **新建** — 客户端数据函数（stats/alerts/auth，不引 next/headers） |
| `apps/web/src/lib/api.ts` | 改为 barrel，仅 `export * from './api.shared'` |
| `apps/web/src/lib/project-context.ts` | **新建** — `getCurrentProjectId()` server-only |
| `apps/web/src/components/ProjectSwitcher.tsx` | **新建** — 项目下拉选择器（client） |
| `apps/web/src/components/Nav.tsx` | **新建** — 共享顶栏（client） |
| `apps/web/src/app/layout.tsx` | 注入 Nav + headers() 读 URL + 默认重定向 |
| `apps/web/src/app/page.tsx` | searchParams + 删手写 nav + 删 try/catch |
| `apps/web/src/app/dashboard/page.tsx` | searchParams 拿 projectId（替换 SEED_PROJECT_ID） |
| `apps/web/src/app/dashboard/DashboardClient.tsx` | 改 import 源为 api.client + 删手写 nav |
| `apps/web/src/app/datasets/page.tsx` | searchParams + 删手写 nav + 删 try/catch |
| `apps/web/src/app/prompts/page.tsx` | searchParams + 删手写 nav + 删 try/catch |
| `apps/web/src/app/alerts/page.tsx` | searchParams 拿 projectId（替换 SEED_PROJECT_ID） |
| `apps/web/src/app/alerts/AlertClient.tsx` | 改 import 源为 api.client + 删手写 nav |
| `apps/web/src/app/login/page.tsx` | 改 import 源为 api.client + 读 `?next=` 登录跳回 |
| `apps/web/src/middleware.ts` | 带 next 参数 + 转发 x-search header |
| `apps/web/src/app/error.tsx` | **新建** — 全局错误边界 |
| `apps/web/src/app/loading.tsx` | **新建** — 加载骨架 |
| `apps/web/src/app/not-found.tsx` | **新建** — 404 页 |

### 脚本
| 文件 | 责任 |
|------|------|
| `scripts/verify-m9.sh` | **新建** — curl 验证鉴权全流程 |

---

## Task 1: 后端 — listAll 仓库方法 + ProjectListItem 类型

**Files:**
- Modify: `apps/server/src/repositories/project-repository.ts`
- Modify: `apps/server/src/repositories/index.ts`

- [ ] **Step 1: 给 IProjectRepository 加 listAll + ProjectListItem 类型**

修改 `apps/server/src/repositories/project-repository.ts`，在 import 行加 `desc`：

```typescript
import { eq, desc } from 'drizzle-orm';
```

在 `IProjectRepository` 接口之前加 `ProjectListItem` 类型：

```typescript
export type ProjectListItem = {
  id: string;
  name: string;
  apiKey: string;
  createdAt: Date;
};
```

给 `IProjectRepository` 接口加方法（保留现有 `findByApiKey`）：

```typescript
export interface IProjectRepository {
  findByApiKey(apiKey: string): Promise<{ id: string; name: string } | null>;
  listAll(): Promise<ProjectListItem[]>;
}
```

给 `PostgresProjectRepository` 类加实现（保留现有 `findByApiKey`）：

```typescript
async listAll(): Promise<ProjectListItem[]> {
  return db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      apiKey: schema.projects.apiKey,
      createdAt: schema.projects.createdAt,
    })
    .from(schema.projects)
    .orderBy(desc(schema.projects.createdAt));
}
```

- [ ] **Step 2: 从 repositories/index.ts 导出类型**

修改 `apps/server/src/repositories/index.ts`，在 `IProjectRepository` 导出行追加 `ProjectListItem`：

```typescript
export type { IProjectRepository, ProjectListItem } from './project-repository.js';
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @oat/server exec tsc --noEmit`
Expected: PASS（无新增错误）

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/repositories/
git commit -m "feat(server): add listAll to ProjectRepository + ProjectListItem type"
```

---

## Task 2: 后端 — projects 路由 + 注册 + 测试

> **鉴权机制**：本服务是 **cookie-based**（`require-auth.ts` 读 `oat_session` cookie 验 JWT，不是 Bearer）。测试参考 `ingestion-api.test.ts`：先设 `process.env.JWT_SECRET`，用 `signToken()` 签 token，通过 `cookie: oat_session=xxx` 注入。`buildApp` 是 **async**，必须 `await`。

**Files:**
- Create: `apps/server/src/routes/projects.ts`
- Modify: `apps/server/src/app.ts`
- Create: `apps/server/tests/projects-api.test.ts`
- Modify: `apps/server/tests/ingestion-api.test.ts`

- [ ] **Step 1: 写路由文件**

创建 `apps/server/src/routes/projects.ts`（闭包工厂，与 `traces.ts` 同构）：

```typescript
import type { FastifyPluginAsync } from 'fastify';
import type { IProjectRepository } from '../repositories/project-repository.js';

export function buildProjectRoutes(deps: {
  projectRepo: IProjectRepository;
}): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async () => {
      const projects = await deps.projectRepo.listAll();
      return { projects };
    });
  };
}
```

- [ ] **Step 2: 在 app.ts 注册路由**

在 `apps/server/src/app.ts` 的 import 区（其他 `buildXxxRoutes` 旁边）加：

```typescript
import { buildProjectRoutes } from './routes/projects.js';
```

在其他 `app.register(...)` 调用旁边（`buildAlertRoutes` 之后、`registerAuthHook` 之前）加：

```typescript
await app.register(buildProjectRoutes(deps), { prefix: '/api/projects' });
```

- [ ] **Step 3: 写测试（cookie 鉴权 + 完整 AppDeps mock）**

创建 `apps/server/tests/projects-api.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import type { AppDeps } from '../src/app.js';
import type { ProjectListItem } from '../src/repositories/project-repository.js';

// 必须在 import signToken 之前设置：verifyToken 依赖它
process.env.JWT_SECRET = 'test-secret';

import { signToken } from '../src/auth/jwt.js';
import { buildApp } from '../src/app.js';

const mockProject: ProjectListItem = {
  id: 'p1',
  name: 'demo',
  apiKey: 'demo-key',
  createdAt: new Date('2026-01-01'),
};

// 受保护路由测试用：签合法 token，注入 cookie（require-auth 读 oat_session）
async function authHeaders(): Promise<{ cookie: string }> {
  const token = await signToken({ userId: 'u-test', email: 'test@oat.dev', role: 'admin' });
  return { cookie: `oat_session=${token}` };
}

// 完整 AppDeps mock：projectRepo.listAll 返回 mockProject，其余给最小桩
function makeMockDeps(): AppDeps {
  return {
    traceRepo: {
      async listTraces() { return []; },
      async getTraceDetail() { return null; },
      async createTraceWithObservations() {},
    },
    projectRepo: {
      async findByApiKey() { return null; },
      async listAll() { return [mockProject]; },
    },
    scoreRepo: {
      async createScore() { return 's1'; },
      async listScoresByTrace() { return []; },
    },
    datasetRepo: {
      async createDataset() { return 'd1'; },
      async listDatasets() { return []; },
      async getDataset() { return null; },
      async addDatasetItem() { return 'i1'; },
      async listDatasetItems() { return []; },
    },
    promptRepo: {
      async createPrompt() { return { promptId: 'p1', version: 1 }; },
      async listPrompts() { return []; },
      async getPrompt() { return null; },
      async getPromptByName() { return null; },
      async addVersion() { return 2; },
      async listVersions() { return []; },
    },
    statsRepo: {
      async getOverview() {
        return {
          range: '24h', series: [],
          summary: { totalTraces: 0, totalTokens: 0, totalCost: '0', avgLatencyMs: null },
          topModels: [], scoreDistribution: [],
        };
      },
    },
    userRepo: {
      async findByEmail() { return null; },
      async create(email, passwordHash) {
        return { id: 'u1', email, passwordHash, role: 'admin', createdAt: new Date(), updatedAt: new Date() };
      },
    },
    alertRepo: {
      async listRules() { return []; },
      async getRule() { return null; },
      async createRule() { throw new Error('not implemented'); },
      async updateRule() { return null; },
      async deleteRule() {},
      async listEvents() { return []; },
      async createEvent() {},
    },
    alertEvaluator: { async evaluate() {} } as unknown as AppDeps['alertEvaluator'],
  } as unknown as AppDeps;
}

describe('GET /api/projects', () => {
  it('returns 401 without session cookie', async () => {
    const app = await buildApp(makeMockDeps());
    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(res.statusCode).toBe(401);
  });

  it('returns project list with apiKey when authenticated', async () => {
    const app = await buildApp(makeMockDeps());
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: await authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]).toMatchObject({
      id: 'p1',
      name: 'demo',
      apiKey: 'demo-key',
    });
  });
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @oat/server test -- projects-api`
Expected: PASS — 2 个测试全过（路由已在 Step 1-2 注册）

- [ ] **Step 5: 修复 ingestion-api.test.ts 的 mock**

在 `apps/server/tests/ingestion-api.test.ts` 的 `projectRepo` mock 对象里（当前只有 `findByApiKey`），追加 `listAll`：

```typescript
const projectRepo: IProjectRepository = {
  async findByApiKey(key: string) {
    return key === 'valid-key' ? { id: 'proj-1', name: 'test' } : null;
  },
  async listAll() { return []; },
};
```

- [ ] **Step 6: 跑全量后端测试**

Run: `pnpm --filter @oat/server test`
Expected: PASS — 全部测试（含新增 2 个）通过

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes/projects.ts apps/server/src/app.ts apps/server/tests/
git commit -m "feat(server): GET /api/projects endpoint + tests"
```

---

## Task 3: 前端 — API 客户端三文件拆分

> **设计要点**：`next/headers` 的 `cookies()` 不能进 client bundle。把 cookie 转发隔离在 `api.server.ts`（顶部 `import 'server-only'`），client 函数（stats/alerts/auth）放 `api.client.ts`，所有类型和 handleResponse 放 `api.shared.ts`（两端安全）。barrel `api.ts` 改为只 `export * from './api.shared'`——不从 server/client re-export 函数，否则 client bundle 会传递引入 `next/headers` 导致构建失败。

**Files:**
- Create: `apps/web/src/lib/api.shared.ts`
- Create: `apps/web/src/lib/api.server.ts`
- Create: `apps/web/src/lib/api.client.ts`
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: 创建 api.shared.ts（搬迁全部类型 + 常量 + handleResponse）**

创建 `apps/web/src/lib/api.shared.ts`。**把现有 `api.ts` 里所有 `export type` 原样搬过来**（包括：`TraceListItem`、`ObservationDetail`、`TraceDetail`、`ScoreItem`、`DatasetListItem`、`PromptListItem`、`PromptVersion`、`PromptDetail`、`StatsPoint`、`StatsSummary`、`TopModel`、`ScoreDistributionItem`、`StatsOverview`、`AuthUser`、`AlertRule`、`AlertEvent`、`NewAlertRule`——字段保持不变），然后追加常量、新类型 `ProjectListItem`、以及 `handleResponse`：

```typescript
export const isServer = typeof window === 'undefined';

export const API_BASE = isServer
  ? (process.env.SERVER_URL ?? 'http://localhost:3001')
  : '';

// 新增类型（后端 GET /api/projects 返回；注意 createdAt 是 ISO 字符串）
export type ProjectListItem = {
  id: string;
  name: string;
  apiKey: string;
  createdAt: string;
};

// 统一响应处理：401 在服务端抛 redirect、在客户端跳 window.location
export async function handleResponse<T = unknown>(res: Response): Promise<T> {
  if (res.status === 401) {
    if (isServer) {
      const { redirect } = await import('next/navigation');
      redirect('/login');
    } else {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
      throw new Error('SESSION_EXPIRED');
    }
  }
  if (!res.ok) {
    let msg = `请求失败: ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message ?? body?.message ?? msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

> 注：原 `api.ts` 里的 `get/post/put/del` 私有函数**不搬**——它们会被 server/client 各自的版本替换（带 cookie 转发 / 带超时）。

- [ ] **Step 2: 创建 api.server.ts（server-only + cookie 转发 + 服务端数据函数）**

创建 `apps/web/src/lib/api.server.ts`。这里放**服务端组件调用的数据函数**（traces/datasets/prompts/scores/me/projects）。函数签名与原 `api.ts` 对应函数一致，仅改为走带 cookie 转发的 `get`：

```typescript
import 'server-only';
import { cookies } from 'next/headers';
import { API_BASE, handleResponse } from './api.shared';
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
} from './api.shared';

async function buildHeaders(): Promise<HeadersInit> {
  const cookieStore = await cookies();
  const session = cookieStore.get('oat_session');
  return session ? { Cookie: `oat_session=${session.value}` } : {};
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    cache: 'no-store',
    credentials: 'include',
    headers: await buildHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  return handleResponse<T>(res);
}

// 从原 api.ts 搬迁（签名不变，改用上面的 get）
export async function listTraces(projectId: string): Promise<TraceListItem[]> {
  const data = await get<{ traces: TraceListItem[] }>(`/api/traces?projectId=${projectId}`);
  return data.traces;
}

export async function getTraceDetail(id: string): Promise<TraceDetail> {
  return get(`/api/traces/${id}`);
}

export async function listScores(traceId: string): Promise<ScoreItem[]> {
  const data = await get<{ scores: ScoreItem[] }>(`/api/traces/${traceId}/scores`);
  return data.scores;
}

export async function listDatasets(projectId: string): Promise<DatasetListItem[]> {
  const data = await get<{ datasets: DatasetListItem[] }>(`/api/datasets?projectId=${projectId}`);
  return data.datasets;
}

export async function listPrompts(projectId: string): Promise<PromptListItem[]> {
  const data = await get<{ prompts: PromptListItem[] }>(`/api/prompts?projectId=${projectId}`);
  return data.prompts;
}

export async function getPromptDetail(
  id: string,
): Promise<{ prompt: PromptDetail; versions: PromptVersion[] }> {
  return get(`/api/prompts/${id}`);
}

// 新增
export async function listProjects(): Promise<{ projects: ProjectListItem[] }> {
  return get(`/api/projects`);
}

export async function getMe(): Promise<{ user: AuthUser }> {
  return get(`/api/auth/me`);
}
```

- [ ] **Step 3: 创建 api.client.ts（客户端数据函数：stats/alerts/auth）**

创建 `apps/web/src/lib/api.client.ts`。客户端 fetch 不转发 cookie（浏览器自动带），但仍走 `handleResponse` 的客户端 401 分支。re-export 组件用到的类型，方便组件单行 import：

```typescript
import { API_BASE, handleResponse } from './api.shared';

export type {
  StatsOverview,
  AlertRule,
  AlertEvent,
  NewAlertRule,
  AuthUser,
} from './api.shared';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    signal: AbortSignal.timeout(15000),
  });
  return handleResponse<T>(res);
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  return handleResponse<T>(res);
}

async function put<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return handleResponse<T>(res);
}

async function del<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'DELETE',
    credentials: 'include',
    signal: AbortSignal.timeout(15000),
  });
  return handleResponse<T>(res);
}

// Dashboard 用（注意 range 是第二个参数，与原 api.ts 一致）
export async function getStatsOverview(
  projectId: string,
  range: string,
): Promise<StatsOverview> {
  return get(`/api/stats/overview?projectId=${projectId}&range=${range}`);
}

// Auth
export async function login(
  email: string,
  password: string,
): Promise<{ user: AuthUser }> {
  return post(`/api/auth/login`, { email, password });
}

export async function logout(): Promise<{ ok: boolean }> {
  return post(`/api/auth/logout`, {});
}

// Alerts
export async function listAlertRules(projectId: string): Promise<AlertRule[]> {
  const data = await get<{ rules: AlertRule[] }>(`/api/alerts/rules?projectId=${projectId}`);
  return data.rules;
}

export async function listAlertEvents(
  projectId: string,
  limit = 50,
): Promise<AlertEvent[]> {
  const data = await get<{ events: AlertEvent[] }>(
    `/api/alerts/events?projectId=${projectId}&limit=${limit}`,
  );
  return data.events;
}

export async function createAlertRule(rule: NewAlertRule): Promise<AlertRule> {
  return post(`/api/alerts/rules`, rule);
}

export async function updateAlertRule(
  id: string,
  patch: Partial<NewAlertRule> & { enabled?: boolean },
): Promise<AlertRule> {
  return put(`/api/alerts/rules/${id}`, patch);
}

export async function deleteAlertRule(id: string): Promise<void> {
  await del(`/api/alerts/rules/${id}`);
}

export async function testAlertWebhook(id: string): Promise<{ ok: boolean }> {
  return post(`/api/alerts/rules/${id}/test`, {});
}
```

> 注：`StatsOverview`/`AlertRule`/`AlertEvent`/`NewAlertRule`/`AuthUser` 这些类型名在函数签名里直接用，需确保它们从 `api.shared` 被 import 进类型空间——上面 `export type {...}` 同时让组件可从 `@/lib/api.client` 引入。

- [ ] **Step 4: 把 api.ts 改为 barrel（仅 shared）**

把 `apps/web/src/lib/api.ts` 内容**整体替换**为：

```typescript
export * from './api.shared';
```

> 不要从 `api.server` 或 `api.client` re-export 函数——否则 client bundle 会传递引入 `next/headers`。类型通过 barrel 仍可从 `@/lib/api` 取得（供组件 `import type` 用）。

- [ ] **Step 5: 安装 server-only 包（如未安装）**

Run: `pnpm --filter @oat/web add server-only`
Expected: 安装成功（`api.server.ts` 顶部的 `import 'server-only'` 依赖此包）

- [ ] **Step 6: typecheck**

Run: `pnpm --filter @oat/web exec tsc --noEmit`
Expected: 此时页面还没改 import 源，会有错误（页面从 `@/lib/api` 导入已搬走的函数，如 `listTraces`）。**暂时忽略**，Task 4-7 会逐个修复。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/
git commit -m "refactor(web): split api.ts into shared/server/client modules"
```

---

## Task 4: project-context — getCurrentProjectId（server-only）

> **职责**：从 URL 的 `?projectId=` 解析项目 ID；若不存在或不在 `listProjects()` 结果里，回退到第一个项目。返回的对象同时带 `projectId`（用于后续 API 调用）和 `projects`（供 ProjectSwitcher 渲染）。

**Files:**
- Create: `apps/web/src/lib/project-context.ts`

- [ ] **Step 1: 创建 project-context.ts**

创建 `apps/web/src/lib/project-context.ts`：

```typescript
import 'server-only';
import { listProjects } from './api.server';
import type { ProjectListItem } from './api.shared';

export async function getCurrentProjectId(
  sp: URLSearchParams,
): Promise<{ projectId: string; projects: ProjectListItem[] }> {
  const { projects } = await listProjects();
  if (projects.length === 0) {
    throw new Error('当前没有可访问的项目，请先创建项目。');
  }
  const fromUrl = sp.get('projectId') ?? '';
  const matched = projects.find((p) => p.id === fromUrl);
  return {
    projectId: matched ? matched.id : projects[0].id,
    projects,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/project-context.ts
git commit -m "feat(web): add getCurrentProjectId server helper"
```

---

## Task 5: ProjectSwitcher + 共享 Nav（client）

> **职责**：`ProjectSwitcher` 是 `<select>`，onChange 用 `router.push` 带新 `?projectId=` 跳转，保留 pathname。`Nav` 整合 Logo、项目选择器、主导航（每条链接带 `?projectId=` base）、用户菜单（邮箱 + 登出按钮）。两者都是 client 组件（用 `useRouter`/`usePathname`/`useSearchParams`）。

**Files:**
- Create: `apps/web/src/components/ProjectSwitcher.tsx`
- Create: `apps/web/src/components/Nav.tsx`

- [ ] **Step 1: 创建 ProjectSwitcher.tsx**

创建 `apps/web/src/components/ProjectSwitcher.tsx`：

```tsx
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ProjectListItem } from '@/lib/api';

export function ProjectSwitcher({ projects }: { projects: ProjectListItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('projectId') ?? projects[0]?.id ?? '';

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('projectId', e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={current}
      onChange={onChange}
      className="border rounded px-2 py-1 text-sm bg-white"
      aria-label="切换项目"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: 创建 Nav.tsx**

创建 `apps/web/src/components/Nav.tsx`：

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { ProjectSwitcher } from './ProjectSwitcher';
import { logout } from '@/lib/api.client';
import type { ProjectListItem, AuthUser } from '@/lib/api';

function navHref(base: string, projectId: string | null) {
  return projectId ? `${base}?projectId=${projectId}` : base;
}

export function Nav({
  projects,
  user,
}: {
  projects: ProjectListItem[];
  user: AuthUser;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId');

  async function onLogout() {
    try {
      await logout();
    } catch {}
    router.push('/login');
    router.refresh();
  }

  const links: { href: string; label: string }[] = [
    { href: '/', label: 'Traces' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/datasets', label: '数据集' },
    { href: '/prompts', label: 'Prompts' },
    { href: '/alerts', label: '告警' },
  ];

  return (
    <nav className="border-b bg-white">
      <div className="mx-auto max-w-7xl flex items-center gap-4 px-6 h-14">
        <Link href={navHref('/', projectId)} className="font-bold text-gray-900">
          OAT
        </Link>
        <ProjectSwitcher projects={projects} />
        <div className="flex items-center gap-1 ml-2">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={navHref(l.href, projectId)}
                className={`px-3 py-1.5 rounded text-sm ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-500">{user.email}</span>
          <button
            onClick={onLogout}
            className="text-sm px-3 py-1 rounded border hover:bg-gray-50"
          >
            登出
          </button>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/
git commit -m "feat(web): add ProjectSwitcher + shared Nav with logout"
```

---

## Task 6: layout.tsx — 注入 Nav + headers() 读 URL + 默认重定向

> **关键约束**：App Router 的 `layout.tsx` **不接收 `searchParams`**（只有 `page.tsx` 接收）。所以 layout 通过 `next/headers` 的 `headers()` 读 middleware 转发的 `x-search` header（Task 8 会加）。`getMe()` 在 `/login` 页会 401（middleware 放行 login），用 `.catch(() => null)` 吞掉，避免死循环。`redirect()` 通过 throw 实现，不要用 try/catch 包裹（会吞掉重定向）。

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: 重写 layout.tsx**

把 `apps/web/src/app/layout.tsx` 的内容替换为（保留现有 `<html>`/`<body>`/字体配置，仅改 default export 的逻辑——执行者需对比现有内容，保留 globals.css import、字体、`<html lang>` 等）：

```tsx
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import './globals.css';
// 保留现有字体 import（如 inter）

import { Nav } from '@/components/Nav';
import { getMe, listProjects } from '@/lib/api.server';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  const search = h.get('x-search') ?? '';
  const sp = new URLSearchParams(search);
  const projectIdFromUrl = sp.get('projectId');

  // getMe 在 /login 会 401 → redirect('/login') 会 throw → 用 .catch 吞掉
  const me = await getMe().catch(() => null);

  let navProjects: Awaited<ReturnType<typeof listProjects>>['projects'] = [];
  if (me) {
    const { projects } = await listProjects().catch(() => ({ projects: [] as never }));
    navProjects = projects;
    // 已登录但 URL 无 projectId：补默认值（保留其他 query，如下方 next）
    if (projects.length > 0 && !projectIdFromUrl) {
      const fallback = new URLSearchParams(search);
      fallback.set('projectId', projects[0].id);
      redirect(`/?${fallback.toString()}`);
    }
  }

  return (
    <html lang="zh-CN">
      <body>
        {me && navProjects.length > 0 && (
          <Nav projects={navProjects} user={me.user} />
        )}
        {children}
      </body>
    </html>
  );
}
```

> 注：执行者需保留原文件的 `import './globals.css'`、字体相关 import 与 `<html>`/`<body>` 上已有的 className。上面是骨架，**字体/globals.css 不要删**。

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @oat/web exec tsc --noEmit`
Expected: layout 与 Nav 无类型错误（页面错误待 Task 7 修复）

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): inject Nav + default project redirect in root layout"
```

---

## Task 7: 页面重构 — searchParams + 删手写 nav + 删 try/catch

> **统一模式**：服务端页面接收 `searchParams: Promise<{ projectId?: string }>`，`await` 后构造 `URLSearchParams`，调 `getCurrentProjectId(sp)` 拿到 `projectId`，再调 `@/lib/api.server` 的函数取数据。**不要用 try/catch 包裹**——`redirect()` 与 401 都通过 throw 实现，try/catch 会吞掉它们；错误会冒泡到 `error.tsx` 边界（Task 9）。同时删除每个页面里手写的 `<nav>`（现由 layout 的 `Nav` 提供）。

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/datasets/page.tsx`
- Modify: `apps/web/src/app/prompts/page.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Modify: `apps/web/src/app/dashboard/DashboardClient.tsx`
- Modify: `apps/web/src/app/alerts/page.tsx`
- Modify: `apps/web/src/app/alerts/AlertClient.tsx`
- Modify: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: 重写 app/page.tsx（Traces 列表）**

把 `apps/web/src/app/page.tsx` 整体替换为：

```tsx
import Link from 'next/link';
import { getCurrentProjectId } from '@/lib/project-context';
import { listTraces } from '@/lib/api.server';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);
  const traces = await listTraces(projectId);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold mb-6">Traces</h1>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">名称</th>
              <th className="text-left px-4 py-2">用户</th>
              <th className="text-left px-4 py-2">会话</th>
              <th className="text-left px-4 py-2">时间</th>
            </tr>
          </thead>
          <tbody>
            {traces.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  暂无 trace，用 SDK 上报一条试试
                </td>
              </tr>
            )}
            {traces.map((t) => (
              <tr key={t.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/traces/${t.id}?projectId=${projectId}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{t.userId ?? '-'}</td>
                <td className="px-4 py-2 text-gray-500">{t.sessionId ?? '-'}</td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(t.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 重写 app/datasets/page.tsx**

把 `apps/web/src/app/datasets/page.tsx` 整体替换为：

```tsx
import Link from 'next/link';
import { getCurrentProjectId } from '@/lib/project-context';
import { listDatasets } from '@/lib/api.server';

export default async function DatasetsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);
  const datasets = await listDatasets(projectId);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold mb-6">数据集</h1>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">名称</th>
              <th className="text-left px-4 py-2">描述</th>
              <th className="text-left px-4 py-2">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {datasets.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  暂无数据集，通过 API 创建一个试试
                </td>
              </tr>
            )}
            {datasets.map((d) => (
              <tr key={d.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/datasets/${d.id}?projectId=${projectId}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {d.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{d.description ?? '-'}</td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(d.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 重写 app/prompts/page.tsx**

把 `apps/web/src/app/prompts/page.tsx` 整体替换为：

```tsx
import Link from 'next/link';
import { getCurrentProjectId } from '@/lib/project-context';
import { listPrompts } from '@/lib/api.server';

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);
  const prompts = await listPrompts(projectId);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold mb-6">Prompt 管理</h1>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">名称</th>
              <th className="text-left px-4 py-2">描述</th>
              <th className="text-left px-4 py-2">当前版本</th>
              <th className="text-left px-4 py-2">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {prompts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  暂无 Prompt，通过 API 创建一个试试
                </td>
              </tr>
            )}
            {prompts.map((p) => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/prompts/${p.id}?projectId=${projectId}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{p.description ?? '-'}</td>
                <td className="px-4 py-2">
                  {p.latestVersion ? (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-green-100 text-green-700">
                      v{p.latestVersion}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(p.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: 重写 app/dashboard/page.tsx（用 getCurrentProjectId 替换 SEED_PROJECT_ID）**

把 `apps/web/src/app/dashboard/page.tsx` 整体替换为（保留对 `range` query 的读取与 DashboardClient 调用）：

```tsx
import { getCurrentProjectId } from '@/lib/project-context';
import { DashboardClient } from './DashboardClient';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; range?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);
  const range = sp.get('range') ?? '24h';

  return (
    <main className="mx-auto max-w-7xl p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <DashboardClient projectId={projectId} initialRange={range} />
    </main>
  );
}
```

> 注：`DashboardClient` 的 props 以现有签名为准（现有为 `projectId` + 可能的 range）。若现有 DashboardClient 接收 `range` 来自内部 state 而非 props，则保留其内部逻辑，仅传 `projectId`——执行者对比现有 props 签名决定是否传 `initialRange`。

- [ ] **Step 5: 改 DashboardClient.tsx（import 源 + 删手写 nav）**

在 `apps/web/src/app/dashboard/DashboardClient.tsx`：

1. 把第 9 行附近的 import：
   ```tsx
   import { getStatsOverview, type StatsOverview } from '@/lib/api';
   ```
   改为：
   ```tsx
   import { getStatsOverview, type StatsOverview } from '@/lib/api.client';
   ```

2. 删除文件开头 JSX 里手写的 `<nav>...</nav>` 块（约第 46-51 行，含 Traces/Dashboard 等链接）——顶栏已由 layout 的 `Nav` 提供。保留 `<main>` 内的统计卡片与图表。

- [ ] **Step 6: 重写 app/alerts/page.tsx（用 getCurrentProjectId 替换 SEED_PROJECT_ID）**

把 `apps/web/src/app/alerts/page.tsx` 整体替换为：

```tsx
import { getCurrentProjectId } from '@/lib/project-context';
import { AlertClient } from './AlertClient';

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);

  return (
    <main className="mx-auto max-w-7xl p-8">
      <h1 className="text-2xl font-bold mb-6">告警</h1>
      <AlertClient projectId={projectId} />
    </main>
  );
}
```

- [ ] **Step 7: 改 AlertClient.tsx（import 源 + 删手写 nav）**

在 `apps/web/src/app/alerts/AlertClient.tsx`：

1. 把顶部从 `@/lib/api` 的 import：
   ```tsx
   import {
     listAlertRules,
     listAlertEvents,
     createAlertRule,
     updateAlertRule,
     deleteAlertRule,
     testAlertWebhook,
     type AlertRule,
     type AlertEvent,
     type NewAlertRule,
   } from '@/lib/api';
   ```
   改为从 `@/lib/api.client` 导入（路径替换，其余不变）：
   ```tsx
   import {
     listAlertRules,
     listAlertEvents,
     createAlertRule,
     updateAlertRule,
     deleteAlertRule,
     testAlertWebhook,
     type AlertRule,
     type AlertEvent,
     type NewAlertRule,
   } from '@/lib/api.client';
   ```

2. 删除 JSX 里手写的 `<nav>...</nav>` 块（约第 97-101 行）——顶栏已由 layout 提供。保留 `<main>` 内的规则与事件表格。

- [ ] **Step 8: 改 login/page.tsx（import 源 + 读 ?next=）**

在 `apps/web/src/app/login/page.tsx`：

1. 把 `import { login } from '@/lib/api';` 改为 `import { login } from '@/lib/api.client';`（`AuthUser` 类型如需，从 `@/lib/api` 取）。

2. 在登录成功的处理里，把 `router.push('/')` 改为优先跳回 `next` 参数：
   ```tsx
   const params = new URLSearchParams(window.location.search);
   const next = params.get('next') || '/';
   router.push(next);
   router.refresh();
   ```
   > 保留现有的 `useState`/表单/错误展示逻辑，仅替换成功跳转目标。

- [ ] **Step 9: typecheck（应全部通过）**

Run: `pnpm --filter @oat/web exec tsc --noEmit`
Expected: PASS — 无错误（所有页面 import 源已修正）

- [ ] **Step 10: lint**

Run: `pnpm --filter @oat/web lint`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/app/
git commit -m "refactor(web): pages use searchParams + shared Nav + api split imports"
```

---

## Task 8: middleware.ts — next 参数 + x-search header 转发

> **职责**：(1) 未登录访问受保护页 → 重定向 `/login?next=<原路径>`；(2) 已登录访问 `/login` → 跳 `/`；(3) 给所有页面请求注入 `x-search` header（值为当前 URL 的 query string），供 layout 的 `headers()` 读取（因为 layout 不接收 searchParams）。matcher 排除 `/_next`、静态资源与 `/login`。

**Files:**
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: 重写 middleware.ts**

把 `apps/web/src/middleware.ts` 整体替换为：

```typescript
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PREFIXES = ['/login'];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = req.cookies.get('oat_session')?.value;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  // 已登录访问 /login → 跳首页
  if (session && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // 未登录访问受保护页 → 跳 /login?next=<原路径>
  if (!session && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // 给下游（layout 的 headers()）转发当前 query string
  const res = NextResponse.next();
  res.headers.set('x-search', search);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
```

> 注：matcher 已通过负向断言排除带点的文件（如 `.png`）与 `_next/*`。`/api` 路由在本仓库的 Next 应用里不存在（后端是独立的 Fastify 服务），故无需额外排除；若将来在 Next 内加 route handler，可在此 matcher 再排除 `/api`。

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @oat/web exec tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat(web): middleware adds ?next= redirect + x-search header forwarding"
```

---

## Task 9: 错误/加载/404 边界

> **职责**：`error.tsx`（client，必须）捕获渲染期抛出的错误（含 SSR fetch 失败），提供"重试"按钮调 `router.refresh()`；`loading.tsx` 提供 SSR 取数时的骨架屏；`not-found.tsx` 提供 404。

**Files:**
- Create: `apps/web/src/app/error.tsx`
- Create: `apps/web/src/app/loading.tsx`
- Create: `apps/web/src/app/not-found.tsx`

- [ ] **Step 1: 创建 error.tsx**

创建 `apps/web/src/app/error.tsx`（必须是 client 组件）：

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isAuth = error.message === 'SESSION_EXPIRED' || error.digest?.includes('SESSION');

  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold mb-2">
        {isAuth ? '登录已过期' : '页面出错了'}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {isAuth ? '请重新登录后再试。' : error.message || '请稍后重试。'}
      </p>
      <div className="flex justify-center gap-3">
        <button
          onClick={() => {
            reset();
            router.refresh();
          }}
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          重试
        </button>
        {isAuth && (
          <a
            href="/login"
            className="px-4 py-2 rounded border text-sm hover:bg-gray-50"
          >
            去登录
          </a>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 创建 loading.tsx**

创建 `apps/web/src/app/loading.tsx`：

```tsx
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="h-7 w-40 bg-gray-200 rounded animate-pulse mb-6" />
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 not-found.tsx**

创建 `apps/web/src/app/not-found.tsx`：

```tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-bold mb-2">404</h1>
      <p className="text-sm text-gray-500 mb-6">页面不存在。</p>
      <Link href="/" className="text-blue-600 hover:underline text-sm">
        返回首页
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: typecheck + lint**

Run: `pnpm --filter @oat/web exec tsc --noEmit && pnpm --filter @oat/web lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/error.tsx apps/web/src/app/loading.tsx apps/web/src/app/not-found.tsx
git commit -m "feat(web): add error/loading/not-found boundaries"
```

---

## Task 10: verify-m9.sh 脚本 + 全量验证

> **职责**：写一个 curl 脚本验证"未登录 401 → 登录拿 cookie → 带 cookie 取 /api/projects → 取 traces"全流程，供手动回归。脚本读环境变量（`OAT_URL`、`OAT_EMAIL`、`OAT_PASSWORD`，有默认值）。

**Files:**
- Create: `scripts/verify-m9.sh`

- [ ] **Step 1: 创建验证脚本**

创建 `scripts/verify-m9.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

OAT_URL="${OAT_URL:-http://localhost:3001}"
OAT_EMAIL="${OAT_EMAIL:-admin@oat.local}"
OAT_PASSWORD="${OAT_PASSWORD:-admin}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "==> 1) 未登录访问 /api/projects 应 401"
code=$(curl -s -o /dev/null -w '%{http_code}' "$OAT_URL/api/projects")
[ "$code" = "401" ] || { echo "FAIL: 预期 401，实际 $code"; exit 1; }
echo "    OK ($code)"

echo "==> 2) 登录拿 session cookie"
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OAT_EMAIL\",\"password\":\"$OAT_PASSWORD\"}" \
  "$OAT_URL/api/auth/login")
[ "$code" = "200" ] || { echo "FAIL: 登录返回 $code"; exit 1; }
echo "    OK ($code)"

echo "==> 3) 带 cookie 取 /api/projects"
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$OAT_URL/api/projects")
[ "$code" = "200" ] || { echo "FAIL: 预期 200，实际 $code"; exit 1; }
echo "    OK ($code)"

echo "==> 4) 取第一个项目的 traces"
pid=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/projects" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n1)
if [ -z "$pid" ]; then
  echo "    (无项目，跳过 traces 验证)"
else
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$OAT_URL/api/traces?projectId=$pid")
  [ "$code" = "200" ] || { echo "FAIL: traces 返回 $code"; exit 1; }
  echo "    OK ($code, projectId=$pid)"
fi

echo "==> 全部验证通过 ✅"
```

- [ ] **Step 2: 加可执行权限 + 自检语法**

Run:
```bash
chmod +x scripts/verify-m9.sh
bash -n scripts/verify-m9.sh
```
Expected: `bash -n` 无输出（语法正确）

- [ ] **Step 3: 全量 lint + typecheck + test**

Run:
```bash
pnpm --filter @oat/server exec tsc --noEmit
pnpm --filter @oat/web exec tsc --noEmit
pnpm --filter @oat/server test
pnpm --filter @oat/web lint
```
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-m9.sh
git commit -m "chore: add scripts/verify-m9.sh for auth flow smoke test"
```

---

## 自检（Self-Review）

完成所有 Task 后，对照规格逐项核对：

- [ ] **规格覆盖**：对照 `docs/specs/2026-07-12-m9-auth-frontend-skeleton-design.md` 的章节，确认本计划覆盖：①后端 listAll + GET /api/projects（Task 1-2）②API 三文件拆分 + cookie 转发（Task 3）③getCurrentProjectId（Task 4）④ProjectSwitcher + Nav + 登出（Task 5）⑤layout headers() 读 URL + 默认重定向（Task 6）⑥各页 searchParams 化（Task 7）⑦middleware next + x-search（Task 8）⑧error/loading/not-found（Task 9）。
- [ ] **无占位符**：通读全文，确认无 `TODO`/`TBD`/`<...>` 等未填项。
- [ ] **类型一致**：`AuthUser`（非 User）；`ProjectListItem.createdAt` 在前端为 `string`、后端为 `Date`；`getStatsOverview(projectId, range)` 双参；`listAlertEvents(projectId, limit)` 双参。
- [ ] **鉴权一致**：测试用 cookie（`oat_session`）非 Bearer；`buildApp` async 需 await；mock 覆盖 `AppDeps` 全部字段含 `alertEvaluator`。
- [ ] **buildApp 注册顺序**：projects 路由在 `registerAuthHook` 之前注册（auth hook 通过 preHandler 拦截，顺序无关功能，但与现有 traces/datasets/alerts 风格一致）。
- [ ] **执行顺序**：Task 3 拆分后页面会暂时报错（Step 6 已说明），Task 4-7 逐个修复；Task 8 的 middleware 必须在 layout（Task 6）依赖的 `x-search` 生效前完成——**执行者应按 Task 编号顺序执行**。

---

## 执行交接

本计划已自检完成。建议用 **superpowers:subagent-driven-development** 执行：每个 Task 派一个子代理，执行完毕回归一次 typecheck/test 再进入下一个 Task。也可用 **superpowers:executing-plans** 在当前会话内顺序执行。请选择执行方式后开始。

---
