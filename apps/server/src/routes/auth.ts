import type { FastifyPluginAsync } from 'fastify';
import { hash, verify } from '@node-rs/argon2';
import type { IUserRepository } from '../repositories/user-repository.js';
import { signToken, COOKIE_NAME, MAX_AGE } from '../auth/jwt.js';

export function buildAuthRoutes(userRepo: IUserRepository): FastifyPluginAsync {
  return async (app) => {
    // POST /api/auth/login — 邮箱+密码登录，成功签 JWT 写 cookie
    app.post('/api/auth/login', async (req, reply) => {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: '缺少邮箱或密码' } });
      }
      const user = await userRepo.findByEmail(email);
      // 用户不存在或密码错误都返回 401，不区分（防止枚举用户）
      if (!user || !(await verify(user.passwordHash, password))) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: '邮箱或密码错误' } });
      }
      const token = await signToken({ userId: user.id, email: user.email, role: user.role });
      reply.setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: MAX_AGE,
      });
      return { user: { id: user.id, email: user.email, role: user.role } };
    });

    // POST /api/auth/logout — 清除 cookie
    app.post('/api/auth/logout', async (_req, reply) => {
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      return { ok: true };
    });

    // GET /api/auth/me — 返回当前登录用户（未登录会被 preHandler 拦 401）
    app.get('/api/auth/me', async (req) => {
      return { user: req.user };
    });
  };
}
