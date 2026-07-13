import type { FastifyInstance } from 'fastify';
import type { IAuditRepository, NewAuditLog } from '../repositories/audit-repository.js';
import { deriveAction, deriveResourceType, extractResourceId } from '../modules/derive-action.js';
import { eventBus } from '../modules/event-bus.js';

declare module 'fastify' {
  interface FastifyRequest {
    __startTime?: number;
  }
}

// M11 审计钩子：onRequest 记录起始时间，onResponse 过滤写操作和错误，落盘并 emit
// 规则：跳过 /health 和非 /api 路径；只记 POST/PUT/PATCH/DELETE 或 status>=400
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
      const entry: NewAuditLog = {
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
      };
      const log = await auditRepo.log(entry);
      eventBus.emit('audit:logged', { log });
    } catch {
      // 审计写入失败不应影响请求响应
    }
  });
}
