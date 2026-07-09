# 设计文档：单管理员认证 + Dashboard 统计图表

> **目标：** 给自托管的 OpenAgentTelemetry 加上 Web UI 登录保护（单管理员），并提供项目级数据洞察 Dashboard。
>
> **构建顺序：** 先 Dashboard（零 schema/auth 耦合，可独立交付），再 Auth（触碰所有路由 + 整个前端）。

---

## 一、背景与现状

### 当前状态（MVP M1-M4 已完成）

- `projects` 表已经是数据隔离边界（有 `apiKey` + `slug`）。所有业务数据都挂在 `projectId` 下。
- **缺口：Web UI 完全无登录。** 前端通过环境变量 `SEED_PROJECT_ID` 硬编码项目 ID，任何能访问到 UI 的人都能看到全部数据。没有 user / account 概念。
- SDK 摄取已通过 `x-api-key`（实际是 `Authorization: Bearer`）鉴权，工作正常，**保持不变**。

### 为什么选「单管理员」而不是「多用户 + 组织」

- 这是自托管工具最主流的形态（Grafana 单组织、Plausible、Umami 等）。
- 多用户 RBAC 要新增 4-5 张表（organizations / members / invitations / roles）、邀请流程、权限校验中间件，对当前阶段收益过低。
- 单管理员方案用一个 `users` 表（预留未来多用户扩展），部署时配一个管理员即可，落地最快。

---

## 二、子系统 1：单管理员认证（Cookie + JWT）

### 2.1 会话机制选型

**采用：http-only Cookie + 签名 JWT（无状态）**

| 方案 | 结论 | 理由 |
|------|------|------|
| ✅ Cookie + JWT | **采用** | 无状态、无 session 表；http-only cookie 会随 Next.js SSR 的 `fetch` 自动携带，**服务端组件天然带认证**，契合现有 SSR 架构 |
| ❌ Cookie + DB session 表 | 否决 | 可逐会话撤销，但单管理员场景用不上，徒增一张表 + 清理逻辑 |
| ❌ Authorization header + localStorage | 否决 | 破坏 Next.js SSR（服务端组件读不到 localStorage） |

### 2.2 数据模型

新增一张表（M5 迁移 `0003_users.sql`）：

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',  -- 预留：未来 'admin' / 'viewer'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> 只有一张表。单管理员场景不需要 user-project 关联表（管理员能看到本部署所有 project）。未来做多用户时再加 `organization_members` 等表，当前 schema 前向兼容。

### 2.3 密码哈希

- **库：`@node-rs/argon2`**（napi-rs 预编译二进制，无需 node-gyp 编译，对多架构 Docker 构建友好）。
- 注册/校验用 `argon2id` 变体（`verify(hash, password)`）。

### 2.4 JWT 与 Cookie

- **JWT 库：`jose`**（纯 JS / ESM 友好，无原生依赖）。
- **签名密钥：** 环境变量 `JWT_SECRET`（启动时校验非空，否则拒绝启动）。
- **载荷：** `{ sub: userId, email, role, iat, exp }`，有效期 **7 天**。
- **Cookie 名：** `oat_session`
- **Cookie 属性：**
  - `httpOnly: true`（防 XSS 读 token）
  - `sameSite: 'lax'`（防 CSRF，允许导航带 cookie）
  - `secure: NODE_ENV === 'production'`（生产走 HTTPS）
  - `path: '/'`
  - `maxAge: 7 * 24 * 3600`

### 2.5 API 端点

| 方法 | 路径 | 鉴权 | 行为 |
|------|------|------|------|
| POST | `/api/auth/login` | 无 | body `{ email, password }`；校验通过 → 设置 cookie + 返回 `{ user: { id, email, role } }`；失败 → 401 |
| POST | `/api/auth/logout` | 需要 | 清除 cookie，返回 `{ ok: true }` |
| GET  | `/api/auth/me` | 需要 | 返回当前登录用户 `{ id, email, role }`，未登录 → 401 |

### 2.6 鉴权中间件（requireAuth preHandler）

新增 `apps/server/src/auth/require-auth.ts`，导出一个 Fastify `preHandler`：

- 从 cookie `oat_session` 读 JWT → 用 `jose.jwtVerify` 校验签名 + 过期。
- 成功：把 `{ userId, email, role }` 挂到 `req.user`（通过 module augmentation 扩展 Fastify 类型）。
- 失败：返回 `401 { error: { code: 'UNAUTHORIZED' } }`。

**挂载范围（关键）：**

- **保护：** 所有 `/api/*` 路由（traces / datasets / prompts / scores / stats / auth/logout / auth/me）。
- **放行：** `/api/public/*`（SDK 摄取，保留 `x-api-key`）、`/api/auth/login`、`/health`、`/api/health`。

实现方式：在 `buildApp` 里用 `app.addHook('preHandler', ...)` 加一个 **按 URL 前缀判断是否跳过** 的全局钩子，而不是每个路由单独挂（避免漏挂）。

### 2.7 管理员引导（Bootstrap）

在 `server.ts` 启动时、`app.listen` 之前执行一次（幂等）：

- 读 `ADMIN_EMAIL` + `ADMIN_PASSWORD` 环境变量（缺失则跳过引导，打印警告）。
- 若 `users` 表无该 email → argon2 哈希密码后插入。
- 若已存在 → 跳过（不改密码，避免重启覆盖管理员手动改的密码）。

> 这样自托管用户在 `.env` / docker-compose 里配好管理员账密即可，无需额外的 signup UI。

### 2.8 前端

- **`/login` 页面：** 邮箱 + 密码表单，POST `/api/auth/login`，成功后 `router.push('/')`。
- **登录守卫：** Next.js `middleware.ts`（Edge runtime）检查 `oat_session` cookie，未带则 302 到 `/login`（放行 `/login` 和静态资源）。
  - 注意：middleware 只检查 cookie **存在性**（Edge 环境不好验签），真正的签名校验在 API 层做。
- **顶栏：** 加用户邮箱 + 登出按钮（POST `/api/auth/logout` 后重定向 `/login`）。

---

## 三、子系统 2：Dashboard 统计图表

### 3.1 数据来源

**纯 SQL 聚合，不改任何现有表结构。** 所有指标从 `traces` / `observations` / `scores` 算出来。

### 3.2 新增端点

```
GET /api/stats/overview?projectId=<uuid>&range=1h|24h|7d|30d
```

返回一个聚合对象（单次请求拿全，减少往返）：

```ts
type StatsOverview = {
  range: string;
  // 时间序列（用于趋势图），按 range 自适应分桶
  series: {
    bucket: string;            // ISO 时间戳（桶起点）
    traceCount: number;
    p50LatencyMs: number | null;
    p90LatencyMs: number | null;
    p99LatencyMs: number | null;
    promptTokens: number;
    completionTokens: number;
    totalCost: string;         // numeric → string 防精度丢失
  }[];
  summary: {
    totalTraces: number;
    totalTokens: number;
    totalCost: string;
    avgLatencyMs: number | null;
  };
  topModels: { model: string; count: number; cost: string }[];
  scoreDistribution: { name: string; avgValue: number; count: number }[];
};
```

### 3.3 指标与 SQL 口径

**时间分桶：** 按 range 自适应 `date_trunc`：
- `1h` → `date_trunc('minute', ...)`
- `24h` → `date_trunc('hour', ...)`
- `7d` / `30d` → `date_trunc('day', ...)`

**Trace 延迟口径：** traces 表只有 `timestamp`（开始时间），无结束时间。延迟 = 该 trace 下所有 observation 的 `max(end_time) - trace.timestamp`（`end_time` 为 null 的忽略）。用相关子查询算。

**分位数（p50/p90/p99）：** PostgreSQL 原生 `percentile_cont(0.5) WITHIN GROUP (ORDER BY duration)`（连续型分位数）。

**Token / 成本：** 从 observations 聚合 `sum(prompt_tokens)` / `sum(completion_tokens)` / `sum(total_cost)`。

**Top models：** observations 按 `model` 分组，count + sum(cost)，取前 5。

**评分分布：** scores 按 `name` 分组，avg(value) + count。

### 3.4 图表（前端 `/dashboard` 页，用 Recharts）

| 图表 | 类型 | 数据 |
|------|------|------|
| 调用量趋势 | Area Chart | series.traceCount |
| 延迟 p50/p90/p99 | Line Chart | series.*LatencyMs |
| Token 用量 | Stacked Bar | series.promptTokens / completionTokens |
| 成本趋势 | Area Chart | series.totalCost |
| 评分分布 | Bar Chart | scoreDistribution |
| Top models | 横向 Bar / 表格 | topModels |

**时间范围选择器：** 1h / 24h / 7d / 30d 按钮，切换时重新拉 `/api/stats/overview`。

### 3.5 依赖

- 前端新增：`recharts`（声明式 React 图表库，契合 Tailwind 风格）。

---

## 四、依赖与影响面汇总

### 新增依赖
- `apps/server`：`@node-rs/argon2`、`@fastify/cookie`、`jose`
- `apps/web`：`recharts`

### 新建文件
- `apps/server/drizzle/0003_users.sql`
- `apps/server/src/auth/require-auth.ts`
- `apps/server/src/auth/jwt.ts`（签发 / 校验封装）
- `apps/server/src/repositories/user-repository.ts`
- `apps/server/src/routes/auth.ts`
- `apps/server/src/routes/stats.ts`
- `apps/server/src/repositories/stats-repository.ts`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/middleware.ts`

### 修改文件
- `apps/server/src/db/schema.ts` — 加 users 表
- `apps/server/src/app.ts` — 注册 auth/stats 路由 + 全局 preHandler
- `apps/server/src/server.ts` — 引导管理员 + 注入 userRepo
- `apps/server/src/repositories/index.ts` — 导出 user/stats 仓储
- `apps/web/src/lib/api.ts` — 加 stats / auth 客户端
- `apps/web/src/app/layout.tsx` 或各页面 — 顶栏加用户/登出
- `docker-compose.yml` — 加 `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `JWT_SECRET` 环境变量
- `.env.example`（若有）— 同上

### 不受影响
- SDK 摄取路径（`/api/public/ingestion`）保持 `x-api-key`，**无破坏性变更**。

---

## 五、测试策略

- **Auth：** 单元测试覆盖 login（正确/错误密码）、JWT 校验、requireAuth 放行/拦截。集成测试：带 cookie 请求受保护路由返回 200，不带返回 401。
- **Stats：** 单元测试覆盖分桶函数（range → date_trunc 映射）、SQL 聚合正确性（用 seed 数据断言数值）。
- **前端：** 手动验证登录流程 + Dashboard 图表渲染（curl 验证 SSR HTML）。

---

## 六、开放问题（写实施计划前需确认）

无。所有关键决策已定：单管理员、cookie+JWT、argon2、jose、Recharts、图表清单如上。
