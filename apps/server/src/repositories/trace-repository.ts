import { db, schema } from '../db/client.js';
import { eq, desc } from 'drizzle-orm';
import type { Observation } from '@oat/shared';

// 接口定义：业务层依赖接口而非实现（为未来换存储预留）
export interface ITraceRepository {
  listTraces(projectId: string, limit: number): Promise<TraceListItem[]>;
  createTraceWithObservations(trace: NewTrace, observations: Observation[]): Promise<void>;
}

export type TraceListItem = {
  id: string;
  name: string;
  userId: string | null;
  sessionId: string | null;
  timestamp: Date;
};

export type NewTrace = {
  id?: string;
  projectId: string;
  name: string;
  userId?: string | null;
  sessionId?: string | null;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
};

// Postgres 实现
export class PostgresTraceRepository implements ITraceRepository {
  async listTraces(projectId: string, limit = 50): Promise<TraceListItem[]> {
    const rows = await db
      .select({
        id: schema.traces.id,
        name: schema.traces.name,
        userId: schema.traces.userId,
        sessionId: schema.traces.sessionId,
        timestamp: schema.traces.timestamp,
      })
      .from(schema.traces)
      .where(eq(schema.traces.projectId, projectId))
      .orderBy(desc(schema.traces.timestamp))
      .limit(limit);
    return rows;
  }

  async createTraceWithObservations(trace: NewTrace, observations: Observation[]): Promise<void> {
    // 用事务保证一致性：trace 和它的 observations 要么都成功要么都回滚
    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(schema.traces)
        .values({
          projectId: trace.projectId,
          name: trace.name,
          userId: trace.userId ?? null,
          sessionId: trace.sessionId ?? null,
          input: trace.input,
          output: trace.output,
          metadata: trace.metadata,
        })
        .returning({ id: schema.traces.id });

      if (observations.length > 0) {
        await tx.insert(schema.observations).values(
          observations.map((o) => ({
            traceId: inserted.id,
            parentId: o.parentId ?? null,
            type: o.type,
            name: o.name,
            startTime: new Date(o.startTime),
            endTime: o.endTime ? new Date(o.endTime) : null,
            input: o.input,
            output: o.output,
            model: o.model,
            promptTokens: o.promptTokens,
            completionTokens: o.completionTokens,
            totalCost: o.totalCost?.toString(),
            level: o.level,
            metadata: o.metadata,
          })),
        );
      }
    });
  }
}
