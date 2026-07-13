import { db, schema } from '../db/client.js';
import { eq, and, sql, inArray, desc, lt } from 'drizzle-orm';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type ItemStatus = 'pending' | 'running' | 'success' | 'failed';

export type JobSummary = Record<string, { avg: number; passRate: number; count: number }>;

export type JobRow = {
  id: string;
  projectId: string;
  name: string;
  datasetId: string;
  promptId: string;
  promptVersion: number;
  providerId: string;
  model: string;
  evaluatorIds: string[];
  status: JobStatus;
  concurrency: number;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  summary: JobSummary | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type JobItemRow = {
  id: string;
  jobId: string;
  datasetItemId: string;
  status: ItemStatus;
  output: unknown;
  traceId: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type NewJob = {
  projectId: string;
  name: string;
  datasetId: string;
  promptId: string;
  promptVersion: number;
  providerId: string;
  model: string;
  evaluatorIds: string[];
  concurrency?: number;
  totalItems: number;
};

export interface IEvalJobRepository {
  createJob(data: NewJob): Promise<JobRow>;
  createItems(jobId: string, datasetItemIds: string[]): Promise<void>;
  listJobs(projectId: string, opts?: { cursor?: string; limit?: number }): Promise<{ jobs: JobRow[]; nextCursor: string | null }>;
  getJob(id: string): Promise<JobRow | null>;
  updateJobStatus(id: string, status: JobStatus, errorMessage?: string): Promise<JobRow | null>;
  incrementJobCounter(id: string, field: 'completedItems' | 'failedItems'): Promise<void>;
  setJobSummary(id: string, summary: JobSummary): Promise<void>;
  listPendingItems(jobId: string, limit: number): Promise<JobItemRow[]>;
  getItem(id: string): Promise<JobItemRow | null>;
  updateItemStatus(id: string, status: ItemStatus, patch?: { output?: unknown; traceId?: string; latencyMs?: number; errorMessage?: string }): Promise<JobItemRow | null>;
  listItems(jobId: string, opts?: { cursor?: string; limit?: number; status?: ItemStatus }): Promise<{ items: JobItemRow[]; nextCursor: string | null }>;
  countItemsByStatus(jobId: string): Promise<{ pending: number; running: number; success: number; failed: number }>;
  interruptRunning(): Promise<number>;
}

function toJobRow(r: typeof schema.evalJobs.$inferSelect): JobRow {
  return {
    id: r.id, projectId: r.projectId, name: r.name,
    datasetId: r.datasetId, promptId: r.promptId, promptVersion: r.promptVersion,
    providerId: r.providerId, model: r.model, evaluatorIds: r.evaluatorIds,
    status: r.status as JobStatus, concurrency: r.concurrency,
    totalItems: r.totalItems, completedItems: r.completedItems, failedItems: r.failedItems,
    summary: r.summary as JobSummary | null, errorMessage: r.errorMessage,
    startedAt: r.startedAt, completedAt: r.completedAt, createdAt: r.createdAt,
  };
}

function toItemRow(r: typeof schema.evalJobItems.$inferSelect): JobItemRow {
  return {
    id: r.id, jobId: r.jobId, datasetItemId: r.datasetItemId,
    status: r.status as ItemStatus, output: r.output,
    traceId: r.traceId, latencyMs: r.latencyMs, errorMessage: r.errorMessage,
    startedAt: r.startedAt, completedAt: r.completedAt,
  };
}

export class PostgresEvalJobRepository implements IEvalJobRepository {
  async createJob(data: NewJob): Promise<JobRow> {
    const [row] = await db.insert(schema.evalJobs).values({
      projectId: data.projectId, name: data.name,
      datasetId: data.datasetId, promptId: data.promptId, promptVersion: data.promptVersion,
      providerId: data.providerId, model: data.model, evaluatorIds: data.evaluatorIds,
      concurrency: data.concurrency ?? 3, totalItems: data.totalItems,
    }).returning();
    return toJobRow(row);
  }

  async createItems(jobId: string, datasetItemIds: string[]): Promise<void> {
    if (datasetItemIds.length === 0) return;
    await db.insert(schema.evalJobItems).values(
      datasetItemIds.map(itemId => ({ jobId, datasetItemId: itemId })),
    );
  }

  async listJobs(projectId: string, opts: { cursor?: string; limit?: number } = {}): Promise<{ jobs: JobRow[]; nextCursor: string | null }> {
    const limit = opts.limit ?? 20;
    const conds = [eq(schema.evalJobs.projectId, projectId)];
    if (opts.cursor) {
      conds.push(lt(schema.evalJobs.createdAt, new Date(opts.cursor)));
    }
    const rows = await db.select().from(schema.evalJobs)
      .where(and(...conds))
      .orderBy(desc(schema.evalJobs.createdAt))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && sliced.length > 0
      ? sliced[sliced.length - 1].createdAt.toISOString()
      : null;
    return { jobs: sliced.map(toJobRow), nextCursor };
  }

  async getJob(id: string): Promise<JobRow | null> {
    const [row] = await db.select().from(schema.evalJobs).where(eq(schema.evalJobs.id, id)).limit(1);
    return row ? toJobRow(row) : null;
  }

  async updateJobStatus(id: string, status: JobStatus, errorMessage?: string): Promise<JobRow | null> {
    const updates: Record<string, unknown> = { status };
    if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted') {
      updates.completedAt = new Date();
    }
    if (status === 'running') {
      updates.startedAt = new Date();
    }
    if (errorMessage !== undefined) updates.errorMessage = errorMessage;
    const [row] = await db.update(schema.evalJobs).set(updates).where(eq(schema.evalJobs.id, id)).returning();
    return row ? toJobRow(row) : null;
  }

  async incrementJobCounter(id: string, field: 'completedItems' | 'failedItems'): Promise<void> {
    const col = field === 'completedItems' ? schema.evalJobs.completedItems : schema.evalJobs.failedItems;
    await db.update(schema.evalJobs)
      .set({ [field]: sql`${col} + 1` })
      .where(eq(schema.evalJobs.id, id));
  }

  async setJobSummary(id: string, summary: JobSummary): Promise<void> {
    await db.update(schema.evalJobs)
      .set({ summary })
      .where(eq(schema.evalJobs.id, id));
  }

  async listPendingItems(jobId: string, limit: number): Promise<JobItemRow[]> {
    const rows = await db.select().from(schema.evalJobItems)
      .where(and(eq(schema.evalJobItems.jobId, jobId), eq(schema.evalJobItems.status, 'pending')))
      .limit(limit);
    return rows.map(toItemRow);
  }

  async getItem(id: string): Promise<JobItemRow | null> {
    const [row] = await db.select().from(schema.evalJobItems).where(eq(schema.evalJobItems.id, id)).limit(1);
    return row ? toItemRow(row) : null;
  }

  async updateItemStatus(
    id: string,
    status: ItemStatus,
    patch: { output?: unknown; traceId?: string; latencyMs?: number; errorMessage?: string } = {},
  ): Promise<JobItemRow | null> {
    const updates: Record<string, unknown> = { status };
    if (status === 'running') updates.startedAt = new Date();
    if (status === 'success' || status === 'failed') updates.completedAt = new Date();
    if (patch.output !== undefined) updates.output = patch.output;
    if (patch.traceId !== undefined) updates.traceId = patch.traceId;
    if (patch.latencyMs !== undefined) updates.latencyMs = patch.latencyMs;
    if (patch.errorMessage !== undefined) updates.errorMessage = patch.errorMessage;
    const [row] = await db.update(schema.evalJobItems).set(updates).where(eq(schema.evalJobItems.id, id)).returning();
    return row ? toItemRow(row) : null;
  }

  async listItems(jobId: string, opts: { cursor?: string; limit?: number; status?: ItemStatus } = {}): Promise<{ items: JobItemRow[]; nextCursor: string | null }> {
    const limit = opts.limit ?? 50;
    const conds = [eq(schema.evalJobItems.jobId, jobId)];
    if (opts.status) {
      conds.push(eq(schema.evalJobItems.status, opts.status));
    }
    const rows = await db.select().from(schema.evalJobItems)
      .where(and(...conds))
      .orderBy(desc(schema.evalJobItems.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && sliced.length > 0
      ? sliced[sliced.length - 1].id
      : null;
    return { items: sliced.map(toItemRow), nextCursor };
  }

  async countItemsByStatus(jobId: string): Promise<{ pending: number; running: number; success: number; failed: number }> {
    const rows = await db.select({
      status: schema.evalJobItems.status,
      count: sql<number>`count(*)::int`,
    }).from(schema.evalJobItems)
      .where(eq(schema.evalJobItems.jobId, jobId))
      .groupBy(schema.evalJobItems.status);
    const result = { pending: 0, running: 0, success: 0, failed: 0 };
    for (const r of rows) {
      if (r.status in result) result[r.status as keyof typeof result] = r.count;
    }
    return result;
  }

  async interruptRunning(): Promise<number> {
    const jobsResult = await db.update(schema.evalJobs)
      .set({ status: 'interrupted', completedAt: new Date(), errorMessage: '服务器重启中断' })
      .where(inArray(schema.evalJobs.status, ['running', 'pending']))
      .returning({ id: schema.evalJobs.id });
    await db.update(schema.evalJobItems)
      .set({ status: 'failed', completedAt: new Date(), errorMessage: '服务器重启中断' })
      .where(inArray(schema.evalJobItems.status, ['running', 'pending']));
    return jobsResult.length;
  }
}
