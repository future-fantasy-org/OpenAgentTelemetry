# M10 安全加固 Design Spec

> 关联：M9 spec `docs/specs/2026-07-12-m9-auth-frontend-skeleton-design.md` 在"明确不在 M9 范围"段落把以下三项划入 M10。本规格落实这三项。

## 1. 背景与动机

M9 修复了鉴权链路本身的破损（SSR cookie 转发、项目选择器、前端骨架），使"登录 → 切项目 → 看数据"闭环可用。但系统审计发现的另三类 HIGH 级安全问题仍未处理：

1. **API Key 明文存储** — `projects.api_key` 是明文 unique 列，数据库被读取（备份泄露、SQL 注入、运维误查）即等于所有项目的上报凭证泄露。SDK 用明文 key 上报，服务端 `WHERE api_key = $1` 直接比对。
2. **IDOR（Insecure Direct Object Reference）** — 所有数据路由（traces/datasets/prompts/alerts/stats）接收 `projectId` query 参数，`registerAuthHook` 只校验"用户已登录"，不校验"该 projectId 是否存在/是否归属当前用户"。登录用户可枚举任意 UUID 探测他人项目（单 admin 下所有项目都归 admin，风险有限，但缺乏正式校验=埋雷）。
3. **无限流** — `/api/public/ingestion`（API Key 鉴权，公开）可被刷量写脏数据；`/api/auth/login`（公开）可被暴力破解密码。

## 2. 目标与非目标

**目标（三项必做）：**
- API Key 哈希化：数据库只存 SHA-256 哈希，明文 key 仅在创建时返回一次。
- IDOR 校验：所有接收 `projectId` 的路由校验该项目存在（单 admin 范围内的最小闭环）。
- 全局限流：login 防暴力破解、ingestion 防刷量、其他路由防滥用。

**非目标（明确不做）：**
- 多租户 `user_projects` 关联表（M9 spec 明确"仍是单 admin"，本规格不引入）。
- API Key 轮换/吊销 UI（仅提供后端能力，UI 留后续）。
- WAF / 反爬 / 验证码（超出基础设施范围）。
- 审计日志（独立议题，留 M11+）。

## 3. 决策与选型

### 3.1 API Key 哈希化 — 破坏性迁移

**选型：SHA-256 单向哈希，破坏性迁移（无明文 fallback）。**

| 方案 | 取舍 |
|------|------|
| **A 破坏性（选）** | 加 `apiKeyHash` 列，ingestion 哈希入参后比对；seed 生成随机 key、打印明文一次、只存哈希。老明文 key 失效，数据可重建。最干净，无遗留攻击面 |
| B 双列过渡 | 保留 `apiKey` 明文列 + 新增 `apiKeyHash`，ingestion 优先查哈希、fallback 查明文。向后兼容好，但明文仍存、安全收益滞后、代码复杂 |
| C 仅新项目 | 老项目明文、新项目哈希。永久遗留混合态，最差 |

**选 A 的理由**：本服务是自托管单 admin、seed 数据可随时重建（`pnpm db:seed`），无外部 SDK 用户依赖固定 key。破坏性迁移成本最低、安全收益最大。

**为什么用 SHA-256 而非 argon2/bcrypt**：API Key 是高熵随机串（32 字节 = 256 bit），不需要慢哈希防彩虹表/字典攻击。SHA-256 足够，且 ingestion 是高频路径（每次上报都比对），慢哈希会成为性能瓶颈。密码（低熵）才需要 argon2（M6 已用）。

### 3.2 IDOR — 项目存在性校验（非归属校验）

**选型：preHandler 校验 projectId 存在于 projects 表。**

| 方案 | 取舍 |
|------|------|
| **A 存在性校验（选）** | 加 `projectExists(projectId)` 仓库方法 + preHandler 钩子，校验请求中的 projectId 真实存在。防 UUID 枚举注入。单 admin 下等价于"全可访问"，诚实标注局限 |
| B 引入 user_projects | 加关联表 + 归属校验。为多租户铺路，但 M9 spec 明确"仍是单 admin"，超出 M10 范围 |
| C 跳过 | 不做。登录用户可探测任意 UUID |

**选 A 的理由**：与 M9 spec 的"仍是单 admin"约束一致。`projectExists` 是后续做多租户时的天然挂载点（届时改成"用户对该项目有访问权"查询）。

**实现位置**：单独的 `registerProjectAccessHook(app, projectRepo)` preHandler，而非塞进 `registerAuthHook`。理由：单一职责（鉴权 vs 资源存在性），且未来多租户时只换这一个 hook。

### 3.3 限流 — @fastify/rate-limit 内存

**选型：`@fastify/rate-limit` 插件，内存存储，分层限速。**

| 方案 | 取舍 |
|------|------|
| **A 内存（选）** | 官方插件，零新基础设施。单实例部署（当前 docker-compose 单 server）足够。重启计数器重置可接受 |
| B Redis-backed | `@fastify/rate-limit` + ioredis。多实例持久化计数。docker-compose 已有 redis，但 M10 不必引入新依赖耦合 |
| C 自实现 | token bucket 中间件。可控但重复造轮子 |

**选 A 的理由**：当前是单实例部署，内存限流完全够用。未来多实例时 `@fastify/rate-limit` 只需换 `redisStore`，无代码迁移成本。

**分层策略：**
| 路由 | 限速 | 理由 |
|------|------|------|
| `POST /api/auth/login` | 10 req/min/IP | 防暴力破解密码 |
| `POST /api/public/ingestion` | 600 req/min/IP | SDK 批量上报合理量，但封死刷脏数据 |
| 其他 `/api/*` | 100 req/min/IP | UI 正常使用远低于此 |

## 4. 详细设计

### 4.1 数据模型变更

`apps/server/src/db/schema.ts` 的 `projects` 表：

```typescript
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  apiKeyHash: text('api_key_hash').notNull().unique(),  // 新：SHA-256 hex
  apiKeyPreview: text('api_key_preview').notNull(),     // 新：后4位，供 UI 展示
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**迁移策略**：drizzle-kit 生成 `0005_api_key_hash.sql`。因破坏性迁移，不写数据搬迁 SQL；seed 脚本重建 demo 项目。现有生产数据（如有）需手动重新签发 key——本规格假设自托管环境数据可重建。

### 4.2 API Key 生成与校验

新模块 `apps/server/src/modules/api-key.ts`：

```typescript
import { createHash, randomBytes } from 'node:crypto';

const PREFIX = 'oat_';  // 可识别前缀，方便日志/过滤

export function generateApiKey(): { raw: string; hash: string; preview: string } {
  const raw = PREFIX + randomBytes(24).toString('hex');  // 32 字节熵，前缀 + 48 hex 字符
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

**ProjectRepository 接口变更：**

```typescript
export interface IProjectRepository {
  findByApiKey(rawApiKey: string): Promise<{ id: string; name: string } | null>;
  listAll(): Promise<ProjectListItem[]>;
  exists(projectId: string): Promise<boolean>;  // 新：IDOR 校验用
}

export class PostgresProjectRepository implements IProjectRepository {
  async findByApiKey(rawApiKey: string) {
    const hash = hashApiKey(rawApiKey);  // 入参哈希后比对
    const [row] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(eq(schema.projects.apiKeyHash, hash));
    return row ?? null;
  }

  async exists(projectId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);
    return !!row;
  }

  async listAll(): Promise<ProjectListItem[]> {
    return db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        apiKeyPreview: schema.projects.apiKeyPreview,  // 改：只返后4位
        createdAt: schema.projects.createdAt,
      })
      .from(schema.projects)
      .orderBy(desc(schema.projects.createdAt));
  }
}
```

> `ProjectListItem` 类型同步改：`apiKey: string` → `apiKeyPreview: string`。M9 的 `GET /api/projects` 返回结构跟着变（前端 Nav/ProjectSwitcher 不展示 key，不受影响）。

**调用点不变**：`ingestion.ts` 的 `deps.projectRepo.findByApiKey(apiKey)` 和 `scores.ts` 的 `findByApiKey(apiKey)` 签名不变（入参仍是明文 raw key），实现内部改为哈希比对——对调用方透明。

### 4.3 seed 脚本变更

`scripts/seed.ts`：

```typescript
import { generateApiKey } from '../apps/server/src/modules/api-key.js';

// ...
const { raw, hash, preview } = generateApiKey();
const [proj] = await db
  .insert(projects)
  .values({ name: 'Demo Project', slug: 'demo', apiKeyHash: hash, apiKeyPreview: preview })
  .onConflictDoUpdate({
    target: projects.slug,
    set: { apiKeyHash: hash, apiKeyPreview: preview },
  })
  .returning();

console.log(JSON.stringify({ projectId: proj.id, apiKey: raw }, null, 2));  // 明文只打印一次
```

> 运行 `pnpm db:seed` 时控制台输出明文 key，用户需立即记录（后续无法再取回）。这是 API Key 哈希化的固有取舍。

### 4.4 IDOR preHandler

新模块 `apps/server/src/auth/require-project.ts`：

```typescript
import type { FastifyInstance } from 'fastify';
import type { IProjectRepository } from '../repositories/project-repository.js';

// 校验请求中的 projectId 指向真实存在的项目
// 单 admin 范围内：所有存在的项目都对 admin 可访问
// 未来多租户：此处改为查 user_projects 关联
export function registerProjectAccessHook(app: FastifyInstance, projectRepo: IProjectRepository) {
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/api/')) return;
    // 从 query 或 body 提取 projectId
    const projectId = (req.query as { projectId?: string }).projectId
      ?? (req.body as { projectId?: string } | null)?.projectId;
    if (!projectId) return;  // 无 projectId 的路由（如 GET /api/projects）不校验

    const ok = await projectRepo.exists(projectId);
    if (!ok) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '项目不存在' } });
    }
  });
}
```

**注册顺序**（`app.ts`）：`registerAuthHook(app)` 之后立即 `registerProjectAccessHook(app, deps.projectRepo)`。两个 preHandler 按注册顺序串行执行：先鉴权（401），再校验资源（404）。

> **已知局限**：单 admin 下该校验仅防"UUID 枚举注入"（请求不存在的项目），不防"横向越权"（admin A 访问 admin B 的项目）——因为所有项目都归唯一 admin。多租户时需替换为 `user_projects` 归属查询。

### 4.5 限流配置

`app.ts` 注册 `@fastify/rate-limit`（全局默认）：

```typescript
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  global: true,
  max: 100,            // 全局默认：100 req/min/IP
  timeWindow: '1 minute',
});
```

**per-route 覆盖**：`@fastify/rate-limit` 通过路由选项 `config.rateLimit` 接收覆盖值，写在各路由文件里：

`routes/auth.ts` 的 login 路由：
```typescript
app.post('/api/auth/login', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (req, reply) => { /* ... */ });
```

`routes/ingestion.ts` 的上报路由：
```typescript
app.post('/api/public/ingestion', {
  config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
}, async (req, reply) => { /* ... */ });
```

> 注册位置：在 `cors`、`cookie` 之后，路由注册之前。限流命中返回 429 `Too Many Requests`，body 含 `retryIn` 字段（插件默认）。

### 4.6 前端兼容

- `GET /api/projects` 返回的 `apiKeyPreview` 仅用于展示（如 `••••demo`），无 credential 含义。M9 的 `ProjectSwitcher`/`Nav` 不显示 key，无需改。
- 限流 429 由前端 `handleResponse`（`api.shared.ts`）统一处理：增加一个分支返回友好错误。
- 无新增前端页面。

## 5. 测试策略

### 后端单元/集成测试（vitest + fastify inject）

- **api-key 模块**：`generateApiKey` 返回的 raw 以 `oat_` 开头、hash 是 64 位 hex、preview 是 raw 后4位；`hashApiKey(raw) === hash`。
- **ProjectRepository**：`findByApiKey(raw)` 用 mock 插入 hash 后能查到；`exists(uuid)` 对存在/不存在分别返回 true/false。
- **ingestion 鉴权**：用 `findByApiKey` mock，老明文 key 直接查询应失败（因为 mock 只认哈希）。
- **IDOR hook**：请求带不存在的 `projectId` 返回 404；带存在的 projectId 正常通过。
- **限流**：连续 11 次 POST `/api/auth/login` 第 11 次返回 429；连续 601 次 POST `/api/public/ingestion` 第 601 次返回 429。
- **projects-api.test.ts**：更新 mock（`ProjectListItem` 字段改 `apiKeyPreview`），断言返回的是 preview 非 hash。

### 端到端验证（scripts/verify-m10.sh）

```bash
# 1. 用老明文 key 'demo-api-key' 上报 ingestion → 应 401（哈希不匹配）
# 2. 重新 seed 拿到新 raw key
# 3. 用新 raw key 上报 ingestion → 应 202
# 4. 不存在的 projectId 查 traces → 应 404
# 5. 连续 11 次 login → 第 11 次 429
```

## 6. 迁移与兼容

| 变更 | 影响范围 | 缓解 |
|------|----------|------|
| `projects.apiKey` 列删除，新增 `apiKeyHash` + `apiKeyPreview` | drizzle 迁移 0005；现有 DB 数据失效 | 重新 `pnpm db:seed`，记录新 raw key |
| `findByApiKey` 内部改哈希比对 | ingestion/scores 调用点签名不变 | 无需改调用方 |
| `ProjectListItem.apiKey` → `apiKeyPreview` | M9 的 `GET /api/projects` 返回结构变 | 前端不显示 key，无破坏 |
| 新增 IDOR preHandler | 所有带 projectId 的路由 | 现有测试 mock 需让 `exists` 返回 true |
| 新增限流 | 全局 | 测试中 `app.inject` 默认同 IP，注意限流计数 |

## 7. 文件清单

### 后端
| 文件 | 责任 |
|------|------|
| `apps/server/src/db/schema.ts` | projects 表：删 `apiKey`，加 `apiKeyHash` + `apiKeyPreview` |
| `apps/server/drizzle/0005_api_key_hash.sql` | **新建** — 迁移 SQL（drizzle-kit generate） |
| `apps/server/src/modules/api-key.ts` | **新建** — `generateApiKey` + `hashApiKey` |
| `apps/server/src/repositories/project-repository.ts` | `findByApiKey` 改哈希比对；加 `exists`；`listAll` 改返 preview |
| `apps/server/src/auth/require-project.ts` | **新建** — `registerProjectAccessHook` IDOR preHandler |
| `apps/server/src/app.ts` | 注册 `@fastify/rate-limit` + `registerProjectAccessHook`；scores 路由的 `findByApiKey` 调用不变 |
| `apps/server/tests/api-key.test.ts` | **新建** — api-key 模块单测 |
| `apps/server/tests/projects-api.test.ts` | 更新 mock + 断言（`apiKeyPreview`） |
| `apps/server/tests/ingestion-api.test.ts` | 更新 mock（`findByApiKey` 哈希语义） |
| `apps/server/tests/idor.test.ts` | **新建** — IDOR preHandler 测试 |
| `apps/server/tests/rate-limit.test.ts` | **新建** — 限流测试 |

### 脚本
| 文件 | 责任 |
|------|------|
| `scripts/seed.ts` | 用 `generateApiKey` 生成随机 key，打印明文一次，存哈希 |
| `scripts/verify-m10.sh` | **新建** — 端到端验证老 key 失效 + IDOR + 限流 |

### 前端
| 文件 | 责任 |
|------|------|
| `apps/web/src/lib/api.shared.ts` | `ProjectListItem.apiKey` → `apiKeyPreview`；`handleResponse` 加 429 分支 |
