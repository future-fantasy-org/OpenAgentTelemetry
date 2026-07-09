# M6 实施计划：单管理员认证（Cookie + JWT）

> **目标：** 给 Web UI 加登录保护。单管理员模型，http-only cookie + 签名 JWT。SDK 摄取路径不变。
>
> **架构：** 新增 `users` 表 + argon2 哈希 + jose 签发/校验 JWT + 全局 `requireAuth` preHandler（按 URL 前缀放行 `/api/public/*` 和 `/api/auth/login`）+ 前端 `/login` 页 + Next.js middleware 登录守卫。

> **依赖：** M5（Dashboard）先做，本计划基于其完成后的代码状态。

---

## 文件结构

### 新建文件
- `apps/server/drizzle/0003_users.sql` — users 表迁移
- `apps/server/src/auth/jwt.ts` — `signToken(user)` / `verifyToken(cookie)` 封装
- `apps/server/src/auth/require-auth.ts` — 全局 preHandler（按 URL 前缀跳过）
- `apps/server/src/repositories/user-repository.ts` — user 仓储（findByEmail / create）
- `apps/server/src/routes/auth.ts` — login / logout / me
- `apps/web/src/app/login/page.tsx` — 登录表单页（客户端组件）
- `apps/web/src/middleware.ts` — Next.js Edge 登录守卫

### 修改文件
- `apps/server/src/db/schema.ts` — 加 `users` 表
- `apps/server/drizzle/meta/_journal.json` — 加 0003 条目
- `apps/server/src/app.ts` — 注册 auth 路由 + 注册 `@fastify/cookie` + 加全局 preHandler
- `apps/server/src/server.ts` — 启动时引导管理员（读 ADMIN_EMAIL/ADMIN_PASSWORD，幂等）+ 校验 JWT_SECRET 非空
- `apps/server/src/repositories/index.ts` — 导出 user 仓储
- `apps/web/src/lib/api.ts` — 加 `login()` / `logout()` / `getMe()`（credentials: 'include'）
- `apps/web/src/app/layout.tsx`（或新建顶栏组件）— 显示用户邮箱 + 登出按钮
- `docker-compose.yml` — 加 `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `JWT_SECRET` 环境变量
- `apps/server/tests/ingestion-api.test.ts` — mock 加 userRepo
- `apps/server/package.json` — 加 `@node-rs/argon2`、`@fastify/cookie`、`jose`

---

## Task 1: 依赖安装 + users 表

- [ ] server 装依赖：`cd apps/server && pnpm add @node-rs/argon2 @fastify/cookie jose`
- [ ] `schema.ts` 加 users 表：
```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').default('admin').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```
- [ ] 写迁移 `0003_users.sql`：
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
- [ ] `_journal.json` 加 0003 条目
- [ ] 执行迁移：`psql -d oat -f apps/server/drizzle/0003_users.sql`
- [ ] `pnpm -r lint` 全绿

## Task 2: JWT 签发/校验封装

**`apps/server/src/auth/jwt.ts`：**
```typescript
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
const COOKIE_NAME = 'oat_session';
const MAX_AGE = 7 * 24 * 3600; // 7 天

export async function signToken(user: { id: string; email: string; role: string }) {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return { userId: payload.sub!, email: payload.email as string, role: payload.role as string };
}

export { COOKIE_NAME, MAX_AGE };
```

- [ ] TDD：写 `jwt.test.ts` — signToken 返回字符串，verifyToken 能解出 sub/email/role；篡改 token 抛错
- [ ] 实现 jwt.ts，测试通过

## Task 3: 全局 requireAuth preHandler

**`apps/server/src/auth/require-auth.ts`：**
```typescript
import type { FastifyInstance } from 'fastify';

// 放行名单：这些前缀/路径不走 JWT 校验
const PUBLIC_PREFIXES = ['/api/public', '/api/auth/login'];
const PUBLIC_EXACT = ['/health', '/api/health'];

export function registerAuthHook(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0];
    if (PUBLIC_EXACT.includes(url)) return;
    if (PUBLIC_PREFIXES.some((p) => url.startsWith(p))) return;
    // 只保护 /api/*，非 api（404 等）放行
    if (!url.startsWith('/api/')) return;

    const token = req.cookies['oat_session'];
    if (!token) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: '未登录' } });
    try {
      const { verifyToken } = await import('./jwt.js');
      req.user = await verifyToken(token); // 需 module augmentation 扩展 FastifyRequest.user
    } catch {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: '会话无效' } });
    }
  });
}
```

**module augmentation（加到 app.ts 顶部或单独 types.d.ts）：**
```typescript
declare module 'fastify' {
  interface FastifyRequest {
    user?: { userId: string; email: string; role: string };
  }
}
```

- [ ] TDD：写测试 — 带 cookie 访问受保护路由 200，不带 401；访问 `/api/public/*` 不需要 cookie
- [ ] `app.ts` 注册 `@fastify/cookie` + 调用 `registerAuthHook(app)`

## Task 4: user 仓储 + auth 路由

- [ ] `user-repository.ts`：`findByEmail(email)` / `create(email, passwordHash)`
- [ ] `routes/auth.ts`（闭包工厂 `buildAuthRoutes(userRepo)`）：
  - `POST /api/auth/login`：body `{email,password}`；argon2.verify(hash, password)；成功 setCookie + 返回 user；失败 401
  - `POST /api/auth/logout`：clearCookie，返回 `{ ok: true }`
  - `GET /api/auth/me`：返回 `req.user`
- [ ] setCookie 参数：`{ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: MAX_AGE }`

## Task 5: 管理员引导（Bootstrap）

**`server.ts` 启动时（listen 之前）：**
```typescript
async function bootstrapAdmin(userRepo) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) { console.warn('ADMIN_EMAIL/ADMIN_PASSWORD 未设置，跳过管理员引导'); return; }
  const existing = await userRepo.findByEmail(email);
  if (existing) return; // 幂等：已存在不覆盖
  const hash = await argon2.hash(password);
  await userRepo.create(email, hash);
  console.log(`已引导管理员：${email}`);
}
```

- [ ] 校验 `JWT_SECRET` 非空（缺失则 throw，拒绝启动）
- [ ] 引导函数在 main() 里 listen 之前调用

## Task 6: 前端登录页 + middleware 守卫

- [ ] `apps/web/src/middleware.ts`（Edge runtime）：
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }
  const session = req.cookies.get('oat_session');
  if (!session) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}
export const config = { matcher: ['/((?!login|_next|favicon).*)'] };
```
- [ ] `/login` 页（客户端组件）：表单 POST `/api/auth/login`（credentials:'include'），成功 `router.push('/')`，失败显示错误
- [ ] 顶栏加用户邮箱 + 登出按钮（需要从 `/api/auth/me` 拿当前用户）
- [ ] 注意：middleware 只检查 cookie 存在性（Edge 不好验签），真校验在 API 层

## Task 7: docker-compose 环境变量 + 文档

- [ ] `docker-compose.yml` server 加：`ADMIN_EMAIL`、`ADMIN_PASSWORD`、`JWT_SECRET`（给示例值）
- [ ] README 部署章节补充这三个变量的说明

## Task 8: 端到端验证 + 提交

- [ ] 设环境变量启动 server（ADMIN_EMAIL/ADMIN_PASSWORD/JWT_SECRET）
- [ ] curl login：`curl -c cookies.txt -X POST localhost:3001/api/auth/login -d '{"email":"admin@oat.dev","password":"..."}'` → 验证返回 user + cookie 写入
- [ ] curl 受保护路由不带 cookie → 401；`-b cookies.txt` → 200
- [ ] curl `/api/public/ingestion` 不带 cookie（只带 Bearer）→ 仍 202（确认 SDK 路径未受影响）
- [ ] 前端验证：访问 `/` 无 cookie → 跳 `/login`；登录后正常访问
- [ ] `pnpm -r lint && pnpm -r test` 全绿
- [ ] 提交推送：`feat(M6): 单管理员认证 cookie+JWT`
