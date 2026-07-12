# M9 — 鉴权修复 + 前端骨架 + 项目选择器 设计规格

- 日期：2026-07-12
- 范围：修复登录后 SSR 全 401、补齐登出 UI、抽共享 Nav、引入项目选择器、补 error/loading 边界
- 关联审计：`docs/specs/` 下的全项目审计（SDK / Server / Web / DataModel 四份报告）

---

## 1. 背景与动机

对全项目做了一次系统审计，发现 **25+ 个 HIGH 级问题**，分布于 4 个独立子系统：鉴权/SSR、安全加固、数据模型、功能补齐。本规格只处理第一个子系统——**鉴权链路本身的破损**，因为这是"登录后能否正常用"的最基本可用性问题。

P0 已坏的 4 项：

1. **SSR fetch 不转发 cookie**：Node undici fetch 无 cookie jar，`credentials:'include'` 在 server 端是空操作，登录后所有列表/详情页全部 401。
2. **完全没有登出 UI**：`logout()`、`getMe()` 已定义但零调用，顶栏没邮箱没登出按钮，用户登录后无法登出。
3. **middleware 拦 `/api/*`**：cookie 过期时客户端 fetch 拿到 307→HTML 而非 401 JSON，`.json()` 抛 SyntaxError。
4. **无项目选择器 + SEED_PROJECT_ID 硬编码**：5 个 SSR 入口都读构建期 env 定值，多项目场景完全不可用。

M9 同时纳入项目选择器（用户已确认 B 方案），因为"登录 → 切项目 → 看数据"是一个完整闭环。

### 明确不在 M9 范围

- 项目 CRUD UI（创建/删除项目）
- 多用户/多租户权限（仍是单 admin）
- API Key 哈希化（M10）
- 全局限流（M10）
- IDOR projectId 归属校验（M10）
- 实时刷新/SSE（M12）
- Traces 列表分页（M12）

---

## 2. 技术方案选型

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **A 纯 SSR + URL（选定）** | `cookies()` 转发 + URL query 持久项目选择 + root layout 拉 Nav | 改动量最小、不引入新依赖、URL 状态天然可分享 | 切项目触发完整 SSR 导航，无 SPA 过渡 |
| B 全 Client + SWR | 所有页面改 `'use client'`，SWR 做数据获取 | 切项目零跳转、自动重验证 | 首屏白屏、引入 SWR 依赖、所有页面重写、工作量翻倍 |
| C 混合 | SSR 拉首屏 + SWR 增量刷新 | 兼顾首屏和实时性 | 维护两套数据路径、状态同步复杂度高 |

**选 A 的理由**：最贴合现有 SSR + App Router 架构，改动量最小，不引入新依赖。后续 M12 若要实时刷新可增量引入 SWR，不冲突。

---

## 3. 后端：listProjects API

### 新增端点

`GET /api/projects`（受 JWT 保护，不需要 projectId 参数）

**响应**：

```json
{
  "projects": [
    { "id": "uuid", "name": "demo", "apiKey": "demo-api-key", "createdAt": "..." }
  ]
}
```

返回 `apiKey` 完整字段，理由：此端点只对已登录 admin 开放，前端"复制 API Key"功能需要。

### Repository 改动

`IProjectRepository` 新增方法：

```typescript
listAll(): Promise<Project[]>;
```

`PostgresProjectRepository` 实现：

```typescript
async listAll() {
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}
```

### 路由文件

新建 `apps/server/src/routes/projects.ts`，沿用闭包工厂模式：

```typescript
export function buildProjectRoutes(deps: {
  projectRepo: IProjectRepository;
}): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (req, reply) => {
      const projects = await deps.projectRepo.listAll();
      return { projects };
    });
  };
}
```

### 注册

`app.ts` 加：

```typescript
await app.register(buildProjectRoutes(deps), { prefix: '/api/projects' });
```

---

## 4. 前端：API 客户端 SSR cookie 转发 + 401 处理

### 文件拆分

把现有 `lib/api.ts` 拆成三部分，避免 `next/headers` 在 client bundle 报错：

- `lib/api.shared.ts` — 类型定义 + `handleResponse` + `isServer` 常量
- `lib/api.server.ts` — server-only，import `next/headers`，导出 `get/post/put/del` 带 cookie 转发
- `lib/api.client.ts` — client-only，不引用 next/headers，导出同名函数但不转发 cookie
- `lib/api.ts` — barrel，`export *` 从上面三个

> 注：Next.js 在编译期根据 `'use client'` 边界区分 bundle。把 `next/headers` 调用隔离在 server 文件里，client 文件不 import 它即可。barrel re-export 是安全的，因为 server 文件只在 server bundle 求值。

### SSR cookie 转发

```typescript
// lib/api.server.ts
import { cookies } from 'next/headers';

async function buildHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const headers: Record<string, string> = { ...(extra as any) };
  const cookieStore = await cookies();
  const session = cookieStore.get('oat_session');
  if (session) headers['Cookie'] = `oat_session=${session.value}`;
  return headers;
}

export async function get<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    headers: await buildHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  return handleResponse(res, url);
}
```

`post/put/del` 同理。

### 统一响应处理 + 401 跳转

```typescript
// lib/api.shared.ts
export const isServer = typeof window === 'undefined';

export async function handleResponse(res: Response, url: string) {
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
  if (res.status === 204) return undefined;
  return res.json();
}
```

### 超时

所有 fetch 都加 `signal: AbortSignal.timeout(15000)`，15s 超时，避免 hang 死。

### 客户端 fetch 透明

`lib/api.client.ts` 的 `get/post/put/del` 不读 cookie、不转发（浏览器自动带 cookie），但同样走 `handleResponse`，401 时走客户端分支跳登录。

---

## 5. 前端：项目选择器 + URL 持久化

### 状态源

**唯一状态源：URL query param `?projectId=xxx`**。不引入 React Context 或全局 store。

### `lib/project-context.ts`（新建，server-only）

```typescript
import { listProjects } from './api.server';

export async function getCurrentProjectId(
  searchParams: URLSearchParams,
): Promise<{ projectId: string; projects: Project[] }> {
  const fromUrl = searchParams.get('projectId');
  const { projects } = await listProjects();
  if (projects.length === 0) throw new Error('NO_PROJECTS');
  const projectId = fromUrl && projects.some(p => p.id === fromUrl)
    ? fromUrl
    : projects[0].id;
  return { projectId, projects };
}
```

**校验**：URL 里的 projectId 必须在 `listProjects()` 结果里存在，否则回退到第一个项目。这天然防御了"已删除项目 ID 残留在 URL"的情况。

### 各 SSR 入口改造

所有列表页/详情页 server component 顶部统一从 `searchParams` 拿 projectId：

```typescript
// app/page.tsx
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const sp = new URLSearchParams(await searchParams as any);
  const { projectId, projects } = await getCurrentProjectId(sp);
  const traces = await listTraces(projectId);
  return (
    <main className="mx-auto max-w-7xl p-8">
      <TraceList traces={traces} projectId={projectId} />
    </main>
  );
}
```

详情页（`/traces/[id]` 等）不强制要求 projectId 在 URL 里（资源按全局 id 取），但顶栏 Nav 仍需要 projectId——从 `searchParams` 读，缺省时由 `getCurrentProjectId` 回退到第一个项目。

### `<ProjectSwitcher>` 组件（client component）

```tsx
'use client';
export function ProjectSwitcher({
  projects,
  currentId,
}: {
  projects: Project[];
  currentId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('projectId', e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select value={currentId} onChange={onChange} className="...">
      {projects.map(p => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
```

### 移除 `SEED_PROJECT_ID` 前端引用

5 个 SSR 入口（`/`、`/dashboard`、`/datasets`、`/prompts`、`/alerts`）改成 URL 驱动。`.env` 的 `SEED_PROJECT_ID` 仍被 `scripts/seed.ts` 使用，保留不动；前端不再读它。

### 默认重定向

> **Next.js 约束**：`layout.tsx` **不接收** `searchParams`（只有 `page.tsx` 接收）。layout 要拿到当前 URL，必须通过 middleware 把 `pathname`/`search` 写进 request header，再用 `headers()` 读。这套机制与 §6 的 root layout 共用，详见 §6 完整实现（含 `.catch()` 防 login 死循环）。

这保证用户看到的 URL 总是带 projectId，可分享、可多 tab。

---

## 6. 前端：共享 Nav + 登出 UI + 登录跳回

### `<Nav>` 组件（client component）

放在 `components/Nav.tsx`：

```tsx
'use client';
export function Nav({ user, projects, currentProjectId }: NavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const base = `?projectId=${currentProjectId}`;
  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 h-12">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold">OAT</Link>
          <ProjectSwitcher projects={projects} currentId={currentProjectId} />
          <nav className="flex gap-4 text-sm">
            <Link href={`/${base}`}>Traces</Link>
            <Link href={`/dashboard${base}`}>Dashboard</Link>
            <Link href={`/datasets${base}`}>数据集</Link>
            <Link href={`/prompts${base}`}>Prompt</Link>
            <Link href={`/alerts${base}`}>告警</Link>
          </nav>
        </div>
        <div className="relative">
          <button onClick={() => setMenuOpen(v => !v)}>
            {user.email} ▾
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 ...">
              <button onClick={async () => {
                await logout();
                window.location.href = '/login';
              }}>
                登出
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
```

### root layout 注入

> layout 不接收 `searchParams`，改用 `headers()` 读取 middleware 转发的 `x-search` header。

```tsx
// app/layout.tsx (server component)
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const sp = new URLSearchParams(h.get('x-search') ?? '');
  const projectIdFromUrl = sp.get('projectId');

  let user: User | null = null;
  let projects: Project[] = [];
  try {
    const [meRes, projRes] = await Promise.all([
      getMe().catch(() => null),
      listProjects().catch(() => ({ projects: [] })),
    ]);
    user = meRes?.user ?? null;
    projects = projRes?.projects ?? [];
  } catch {}

  // 仅在已登录且有项目、且 URL 缺 projectId 时重定向补全（login 页 user=null，不会触发）
  if (user && projects.length > 0 && !projectIdFromUrl) {
    redirect(`/?projectId=${projects[0].id}`);
  }

  const currentProjectId = projectIdFromUrl
    && projects.some(p => p.id === projectIdFromUrl)
      ? projectIdFromUrl
      : (projects[0]?.id ?? '');

  return (
    <html lang="zh">
      <body>
        {user && projects.length > 0 && (
          <Nav user={user} projects={projects} currentProjectId={currentProjectId} />
        )}
        {children}
      </body>
    </html>
  );
}
```

### 移除手写 nav

删除 5 个页面里手写的 `<nav>` 块：
- `app/page.tsx`
- `app/dashboard/DashboardClient.tsx`
- `app/datasets/page.tsx`
- `app/prompts/page.tsx`
- `app/alerts/AlertClient.tsx`

### 登录跳回 `?next=`

**middleware.ts**：

```typescript
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 未登录 → 跳 /login 并带 next 参数
  const session = req.cookies.get('oat_session');
  if (!session) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // 已登录 → 把 URL 信息写进 request header，供 layout 的 headers() 读取
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  requestHeaders.set('x-search', req.nextUrl.search);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|manifest.json|login).*)',
  ],
};
```

> matcher 排除 `/api/*`，使客户端 fetch 过期时拿到 401 JSON（而非 307 HTML），由 §4 的 `handleResponse` 客户端分支跳登录。

**login/page.tsx**（client component）：

```tsx
const searchParams = useSearchParams();
const next = searchParams.get('next') || '/';
// 登录成功后
router.push(next);
router.refresh();
```

---

## 7. 前端：error / loading / not-found 边界

### `app/error.tsx`（client component）

```tsx
'use client';
export default function GlobalError({ error, reset }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-xl font-bold text-red-600 mb-2">出错了</h1>
      <p className="text-gray-600 mb-4">{error.message}</p>
      <button onClick={reset} className="px-4 py-1.5 rounded bg-blue-600 text-white">
        重试
      </button>
    </main>
  );
}
```

### `app/loading.tsx`

```tsx
export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl p-8">
      <div className="animate-pulse text-gray-400">加载中...</div>
    </main>
  );
}
```

### `app/not-found.tsx`

```tsx
import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-xl font-bold mb-2">404</h1>
      <p className="text-gray-600 mb-4">页面不存在</p>
      <Link href="/" className="text-blue-600 hover:underline">回到首页</Link>
    </main>
  );
}
```

### 详情页错误细化（可选）

详情页 server component 在 try/catch 中区分：
- `401` → 由 §4 的 redirect 机制处理，不到页面层
- `404` → 显示"资源不存在"提示
- `NO_PROJECTS` → 显示"还没有项目，请先调用 SDK 创建数据"的引导

---

## 8. 受影响的文件清单

### 后端（新增 2 + 修改 3）

| 文件 | 操作 |
|------|------|
| `apps/server/src/routes/projects.ts` | 新建 |
| `apps/server/src/repositories/project-repository.ts` | 修改：加 `listAll()` |
| `apps/server/src/app.ts` | 修改：注册 projects 路由 |
| `apps/server/tests/ingestion-api.test.ts` | 修改：mock 加 `listAll` |
| `apps/server/tests/projects-api.test.ts` | 新建 |

### 前端（新增 9 + 修改 11）

| 文件 | 操作 |
|------|------|
| `apps/web/src/lib/api.shared.ts` | 新建 |
| `apps/web/src/lib/api.server.ts` | 新建 |
| `apps/web/src/lib/api.client.ts` | 新建 |
| `apps/web/src/lib/api.ts` | 修改：变 barrel re-export |
| `apps/web/src/lib/project-context.ts` | 新建 |
| `apps/web/src/components/Nav.tsx` | 新建 |
| `apps/web/src/components/ProjectSwitcher.tsx` | 新建 |
| `apps/web/src/app/error.tsx` | 新建 |
| `apps/web/src/app/loading.tsx` | 新建 |
| `apps/web/src/app/not-found.tsx` | 新建 |
| `apps/web/src/app/layout.tsx` | 修改：注入 Nav + 默认重定向 |
| `apps/web/src/app/page.tsx` | 修改：searchParams + 删手写 nav |
| `apps/web/src/app/dashboard/page.tsx` | 修改：searchParams |
| `apps/web/src/app/dashboard/DashboardClient.tsx` | 修改：删手写 nav |
| `apps/web/src/app/datasets/page.tsx` | 修改：searchParams + 删手写 nav |
| `apps/web/src/app/prompts/page.tsx` | 修改：searchParams + 删手写 nav |
| `apps/web/src/app/alerts/page.tsx` | 修改：searchParams |
| `apps/web/src/app/alerts/AlertClient.tsx` | 修改：删手写 nav |
| `apps/web/src/app/login/page.tsx` | 修改：读 next 参数跳回 |
| `apps/web/src/middleware.ts` | 修改：带 next + matcher 排除 api |

### 脚本（新增 1）

| 文件 | 操作 |
|------|------|
| `scripts/verify-m9.sh` | 新建 |

总计：**新增 12 个（后端 2 + 前端 9 + 脚本 1），修改 14 个（后端 3 + 前端 11），共 26 个文件**。

---

## 9. 测试策略

### 后端测试

`tests/projects-api.test.ts`（新增，复用现有 vitest + mock 基础设施）：

- `GET /api/projects` 返回所有项目（含 apiKey 字段）
- `GET /api/projects` 未登录时返回 401

`tests/ingestion-api.test.ts` 的 `makeMockRepos` 加 `projectRepo.listAll = async () => [mockProject]`。

### 前端测试

项目当前前端无测试框架（lint 只跑 `tsc --noEmit`）。M9 不引入测试框架（避免范围蔓延），用 `scripts/verify-m9.sh` + 浏览器手动验证保证质量。

### `scripts/verify-m9.sh`

用 curl 验证完整鉴权流程：

1. 未登录访问 `/api/projects` → 401
2. 登录 → 拿 cookie
3. 登录后访问 `/api/projects` → 200 + 返回数组（length ≥ 1）
4. 登出 → 清 cookie
5. 登出后再访问 `/api/projects` → 401

---

## 10. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | 未登录访问 `/` → 跳 `/login?next=/` | 浏览器 |
| 2 | 登录后跳回 `next` 指定的原页面 | 浏览器 |
| 3 | 登录后所有 SSR 列表页正常渲染，无 401 | 浏览器 |
| 4 | 详情页（`/traces/[id]`、`/prompts/[id]`、`/datasets/[id]`）正常加载 | 浏览器 |
| 5 | 顶栏显示邮箱 + 登出按钮 | 浏览器 |
| 6 | 点登出 → 跳 `/login`，cookie 清除 | 浏览器 |
| 7 | 项目选择器列出所有项目，切换后 URL 变为 `?projectId=xxx` | 浏览器 |
| 8 | cookie 过期后客户端 fetch → 自动跳 `/login?next=...` | 手动改 cookie |
| 9 | `verify-m9.sh` 全部断言通过 | 脚本 |
| 10 | `pnpm -r lint` 全通过 | 命令 |
| 11 | `pnpm --filter @oat/server test` 11+N 测试全通过 | 命令 |
| 12 | 所有页面顶栏 Nav 一致 | 浏览器逐页 |

---

## 11. 风险与缓解

| 风险 | 缓解 |
|------|------|
| `next/headers` 的 `cookies()` 在某些边缘场景（如 generateStaticParams）不可用 | 所有受影响页面保持动态渲染（`cache: 'no-store'`），不预渲染 |
| 列表页 SSR 401 redirect 进入死循环（layout 拉数据 401 → 跳 login → middleware 放行 login → 又回 layout） | middleware 的 login 路径不进入 layout 的重定向逻辑；layout 里的 `getMe()` 失败时 catch 返回 null，不抛 |
| URL 状态丢失（用户手动删 `?projectId=`） | `getCurrentProjectId` 自动回退到第一个项目；layout 默认重定向 |
| 项目列表很大时下拉选择器难用 | M9 不优化（项目数通常很少），留待未来加搜索框 |

---

## 12. 实施顺序建议

1. 后端 `listProjects` API + 测试（独立、可先合）
2. 前端 `lib/api.*` 拆分 + cookie 转发（基础设施）
3. `lib/project-context.ts` + `<ProjectSwitcher>`
4. root layout + `<Nav>` 组件 + 各页面删手写 nav
5. middleware + login 跳回
6. error / loading / not-found 边界
7. `verify-m9.sh` + 浏览器手动验收
8. lint + test + 提交

每步都可独立 typecheck，避免大爆炸式提交。
