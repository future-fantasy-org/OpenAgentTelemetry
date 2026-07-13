import { db, schema } from '../db/client.js';
import { eq, and } from 'drizzle-orm';

export type EvaluatorType = 'llm_judge' | 'numeric_threshold';

export type LlmJudgeConfig = {
  providerId: string;
  model: string;
  judgePrompt: string;
  min: number;
  max: number;
};

export type NumericThresholdConfig = {
  metric: 'latency_ms' | 'prompt_tokens' | 'completion_tokens' | 'total_cost';
  operator: 'lt' | 'lte' | 'gt' | 'gte';
  threshold: number;
  passScore: number;
  failScore: number;
};

export type EvaluatorRow = {
  id: string;
  projectId: string;
  name: string;
  type: EvaluatorType;
  config: LlmJudgeConfig | NumericThresholdConfig;
  createdAt: Date;
  updatedAt: Date;
};

export interface IEvaluatorRepository {
  create(data: { projectId: string; name: string; type: EvaluatorType; config: LlmJudgeConfig | NumericThresholdConfig }): Promise<EvaluatorRow>;
  listByProject(projectId: string): Promise<EvaluatorRow[]>;
  get(id: string): Promise<EvaluatorRow | null>;
  update(id: string, patch: { name?: string; config?: LlmJudgeConfig | NumericThresholdConfig }): Promise<EvaluatorRow | null>;
  delete(id: string): Promise<void>;
}

function toRow(r: typeof schema.evaluators.$inferSelect): EvaluatorRow {
  return {
    id: r.id, projectId: r.projectId, name: r.name, type: r.type as EvaluatorType,
    config: r.config as LlmJudgeConfig | NumericThresholdConfig,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export class PostgresEvaluatorRepository implements IEvaluatorRepository {
  async create(data: { projectId: string; name: string; type: EvaluatorType; config: LlmJudgeConfig | NumericThresholdConfig }): Promise<EvaluatorRow> {
    const [row] = await db.insert(schema.evaluators).values({
      projectId: data.projectId, name: data.name, type: data.type, config: data.config,
    }).returning();
    return toRow(row);
  }

  async listByProject(projectId: string): Promise<EvaluatorRow[]> {
    const rows = await db.select().from(schema.evaluators)
      .where(eq(schema.evaluators.projectId, projectId))
      .orderBy(schema.evaluators.createdAt);
    return rows.map(toRow);
  }

  async get(id: string): Promise<EvaluatorRow | null> {
    const [row] = await db.select().from(schema.evaluators).where(eq(schema.evaluators.id, id)).limit(1);
    return row ? toRow(row) : null;
  }

  async update(id: string, patch: { name?: string; config?: LlmJudgeConfig | NumericThresholdConfig }): Promise<EvaluatorRow | null> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.config !== undefined) updates.config = patch.config;
    const [row] = await db.update(schema.evaluators).set(updates).where(eq(schema.evaluators.id, id)).returning();
    return row ? toRow(row) : null;
  }

  async delete(id: string): Promise<void> {
    await db.delete(schema.evaluators).where(eq(schema.evaluators.id, id));
  }
}
