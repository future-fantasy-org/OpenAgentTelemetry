import type { FastifyInstance } from 'fastify';
import { verifyToken, COOKIE_NAME } from './jwt.js';

// 放行名单：这些路径不走 JWT 校验
// /api/public/* —— SDK 摄取，走 x-api-key
// /api/auth/login —— 登录本身要能匿名访问
const PUBLIC_PREFIXES = ['/api/public', '/api/auth/login'];
const PUBLIC_EXACT = ['/health', '/api/health'];

// 注册全局 preHandler：所有 /api/*（除放行名单）都要带 cookie JWT
// 用全局钩子而非每路由单独挂：避免漏挂某个路由导致越权
export function registerAuthHook(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0];
    // 健康检查放行
    if (PUBLIC_EXACT.includes(url)) return;
    // SDK 摄取 + 登录放行
    if (PUBLIC_PREFIXES.some((p) => url.startsWith(p))) return;
    // 只保护 /api/*，其他路径（404 等）放行让路由自己处理
    if (!url.startsWith('/api/')) return;

    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: '未登录' } });
    }
    try {
      req.user = await verifyToken(token);
    } catch {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: '会话无效或已过期' } });
    }
  });
}
