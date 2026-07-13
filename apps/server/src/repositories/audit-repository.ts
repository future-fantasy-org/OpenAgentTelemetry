import { db, schema } from '../db/client.js';
import { eq, desc, lt, and, gte, lte } from 'drizzle-orm';

export type AuditLog = {
  id: string;
  createdAt: Date;
  actorEmail: string | null;
  actorIp: string | null;
  action: string;
  method: string;
  path: string;
  resourceType: string | null;
  resourceId: string | null;
  projectId: string | null;
  statusCode: number;
  durationMs: number | null;
  metadata: Record<string, unknown>;
};

export type NewAuditLog = Omit<AuditLog, 'id' | 'createdAt'>;

export interface IAuditRepository {
  log(entry: NewAuditLog): Promise<AuditLog>;
  list(params: {
    projectId?: string;
    action?: string;
    actorEmail?: string;
    from?: Date;
    to?: Date;
    cursor?: string;
    limit?: number;
  }): Promise<{ logs: AuditLog[]; nextCursor: string | null }>;
}

export class PostgresAuditRepository implements IAuditRepository {
  async log(entry: NewAuditLog): Promise<AuditLog> {
    const [row] = await db.insert(schema.auditLogs).values({
      actorEmail: entry.actorEmail,
      actorIp: entry.actorIp,
      action: entry.action,
      method: entry.method,
      path: entry.path,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      projectId: entry.projectId,
      statusCode: entry.statusCode,
      durationMs: entry.durationMs,
      metadata: entry.metadata,
    }).returning();
    return row as AuditLog;
  }

  async list(params: {
    projectId?: string;
    action?: string;
    actorEmail?: string;
    from?: Date;
    to?: Date;
    cursor?: string;
    limit?: number;
  }): Promise<{ logs: AuditLog[]; nextCursor: string | null }> {
    const limit = Math.min(params.limit ?? 50, 200);
    const conditions = [];
    if (params.projectId) conditions.push(eq(schema.auditLogs.projectId, params.projectId));
    if (params.action) conditions.push(eq(schema.auditLogs.action, params.action));
    if (params.actorEmail) conditions.push(eq(schema.auditLogs.actorEmail, params.actorEmail));
    if (params.from) conditions.push(gte(schema.auditLogs.createdAt, params.from));
    if (params.to) conditions.push(lte(schema.auditLogs.createdAt, params.to));
    if (params.cursor) {
      conditions.push(lt(schema.auditLogs.createdAt, new Date(params.cursor)));
    }

    const rows = await db.select().from(schema.auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const logs = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && logs.length > 0
      ? logs[logs.length - 1].createdAt.toISOString()
      : null;

    return { logs: logs as AuditLog[], nextCursor };
  }
}
