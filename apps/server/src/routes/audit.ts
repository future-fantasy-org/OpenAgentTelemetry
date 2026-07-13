import type { FastifyPluginAsync } from 'fastify';
import type { IAuditRepository } from '../repositories/audit-repository.js';

export function buildAuditRoutes(deps: { auditRepo: IAuditRepository }): FastifyPluginAsync {
  return async (app) => {
    // GET /api/audit/logs — 审计日志列表，支持 projectId/action/actor/from/to 筛选 + cursor 分页
    app.get('/api/audit/logs', async (req) => {
      const { projectId, action, actor, from, to, cursor, limit } = req.query as {
        projectId?: string;
        action?: string;
        actor?: string;
        from?: string;
        to?: string;
        cursor?: string;
        limit?: string;
      };
      return await deps.auditRepo.list({
        projectId: projectId ?? undefined,
        action: action ?? undefined,
        actorEmail: actor ?? undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        cursor: cursor ?? undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
    });
  };
}
