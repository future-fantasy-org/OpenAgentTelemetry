import { db, schema } from '../db/client.js';
import { eq, desc } from 'drizzle-orm';

export interface IScoreRepository {
  createScore(score: NewScore): Promise<string>;
  listScoresByTrace(traceId: string): Promise<ScoreItem[]>;
}

export type NewScore = {
  projectId: string;
  traceId?: string | null;
  observationId?: string | null;
  name: string;
  value: number;
  comment?: string | null;
  source?: 'user' | 'api' | 'eval_job';
};

export type ScoreItem = {
  id: string;
  traceId: string | null;
  observationId: string | null;
  name: string;
  value: string;
  comment: string | null;
  source: string;
  createdAt: Date;
};

export class PostgresScoreRepository implements IScoreRepository {
  async createScore(score: NewScore): Promise<string> {
    const [inserted] = await db
      .insert(schema.scores)
      .values({
        projectId: score.projectId,
        traceId: score.traceId ?? null,
        observationId: score.observationId ?? null,
        name: score.name,
        value: score.value.toString(),
        comment: score.comment ?? null,
        source: score.source ?? 'api',
      })
      .returning({ id: schema.scores.id });
    return inserted.id;
  }

  async listScoresByTrace(traceId: string): Promise<ScoreItem[]> {
    const rows = await db
      .select()
      .from(schema.scores)
      .where(eq(schema.scores.traceId, traceId))
      .orderBy(desc(schema.scores.createdAt));
    return rows.map((r) => ({
      id: r.id,
      traceId: r.traceId,
      observationId: r.observationId,
      name: r.name,
      value: r.value,
      comment: r.comment,
      source: r.source,
      createdAt: r.createdAt,
    }));
  }
}
