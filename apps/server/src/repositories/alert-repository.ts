import { db, schema } from '../db/client.js';
import { eq, desc } from 'drizzle-orm';

// threshold / metricValue 用 string 暴露：drizzle 的 numeric 列默认按字符串返回，
// 避免大数/精度丢失；调用方需要时自行 parseFloat
export interface AlertRule {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  metric: string;
  operator: string;
  threshold: string;
  windowSeconds: number;
  webhookUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewAlertRule {
  projectId: string;
  name: string;
  metric: string;
  operator?: string;
  threshold: number;
  windowSeconds?: number;
  webhookUrl?: string | null;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  projectId: string;
  metricValue: string;
  threshold: string;
  triggeredAt: Date;
  resolvedAt: Date | null;
  notificationStatus: string;
}

export interface NewAlertEvent {
  ruleId: string;
  projectId: string;
  metricValue: number;
  threshold: number;
  notificationStatus: string;
}

export interface IAlertRepository {
  listRules(projectId: string): Promise<AlertRule[]>;
  getRule(id: string): Promise<AlertRule | null>;
  createRule(rule: NewAlertRule): Promise<AlertRule>;
  updateRule(id: string, patch: Partial<NewAlertRule & { enabled: boolean }>): Promise<AlertRule | null>;
  deleteRule(id: string): Promise<void>;
  listEvents(projectId: string, limit: number): Promise<AlertEvent[]>;
  createEvent(event: NewAlertEvent): Promise<void>;
}

export class PostgresAlertRepository implements IAlertRepository {
  async listRules(projectId: string): Promise<AlertRule[]> {
    const rows = await db
      .select()
      .from(schema.alertRules)
      .where(eq(schema.alertRules.projectId, projectId))
      .orderBy(desc(schema.alertRules.createdAt));
    return rows as AlertRule[];
  }

  async getRule(id: string): Promise<AlertRule | null> {
    const rows = await db
      .select()
      .from(schema.alertRules)
      .where(eq(schema.alertRules.id, id))
      .limit(1);
    return (rows[0] as AlertRule) ?? null;
  }

  async createRule(rule: NewAlertRule): Promise<AlertRule> {
    const [row] = await db
      .insert(schema.alertRules)
      .values({
        projectId: rule.projectId,
        name: rule.name,
        metric: rule.metric,
        operator: rule.operator ?? 'gt',
        threshold: rule.threshold.toString(),
        windowSeconds: rule.windowSeconds ?? 300,
        webhookUrl: rule.webhookUrl ?? null,
      })
      .returning();
    return row as AlertRule;
  }

  async updateRule(
    id: string,
    patch: Partial<NewAlertRule & { enabled: boolean }>,
  ): Promise<AlertRule | null> {
    // 只更新 patch 中出现的字段，避免覆盖未传入的列
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.enabled !== undefined) updates.enabled = patch.enabled;
    if (patch.metric !== undefined) updates.metric = patch.metric;
    if (patch.operator !== undefined) updates.operator = patch.operator;
    if (patch.threshold !== undefined) updates.threshold = patch.threshold.toString();
    if (patch.windowSeconds !== undefined) updates.windowSeconds = patch.windowSeconds;
    if (patch.webhookUrl !== undefined) updates.webhookUrl = patch.webhookUrl;

    const [row] = await db
      .update(schema.alertRules)
      .set(updates)
      .where(eq(schema.alertRules.id, id))
      .returning();
    return (row as AlertRule) ?? null;
  }

  async deleteRule(id: string): Promise<void> {
    await db.delete(schema.alertRules).where(eq(schema.alertRules.id, id));
  }

  async listEvents(projectId: string, limit: number): Promise<AlertEvent[]> {
    const rows = await db
      .select()
      .from(schema.alertEvents)
      .where(eq(schema.alertEvents.projectId, projectId))
      .orderBy(desc(schema.alertEvents.triggeredAt))
      .limit(limit);
    return rows as AlertEvent[];
  }

  async createEvent(event: NewAlertEvent): Promise<void> {
    await db.insert(schema.alertEvents).values({
      ruleId: event.ruleId,
      projectId: event.projectId,
      metricValue: event.metricValue.toString(),
      threshold: event.threshold.toString(),
      notificationStatus: event.notificationStatus,
    });
  }
}
