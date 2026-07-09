import { db, schema } from '../db/client.js';
import { sql } from 'drizzle-orm';

// range → date_trunc 分桶粒度
// 为什么用查表而不是 if-else：把映射逻辑集中一处，便于单测覆盖全部分支
export function bucketFor(range: string): string {
  switch (range) {
    case '1h':
      return 'minute';
    case '24h':
      return 'hour';
    case '7d':
    case '30d':
      return 'day';
    default:
      return 'hour';
  }
}

// range → 起始时间点（往前推 N），用于 WHERE timestamp >= ?
export function rangeStart(range: string): Date {
  const ms: Record<string, number> = {
    '1h': 3600_000,
    '24h': 86_400_000,
    '7d': 7 * 86_400_000,
    '30d': 30 * 86_400_000,
  };
  const delta = ms[range] ?? ms['24h'];
  return new Date(Date.now() - delta);
}

export interface IStatsRepository {
  getOverview(projectId: string, range: string): Promise<StatsOverview>;
}

export type StatsPoint = {
  bucket: string;
  traceCount: number;
  p50LatencyMs: number | null;
  p90LatencyMs: number | null;
  p99LatencyMs: number | null;
  promptTokens: number;
  completionTokens: number;
  totalCost: string;
};

export type StatsSummary = {
  totalTraces: number;
  totalTokens: number;
  totalCost: string;
  avgLatencyMs: number | null;
};

export type TopModel = {
  model: string;
  count: number;
  cost: string;
};

export type ScoreDistributionItem = {
  name: string;
  avgValue: number;
  count: number;
};

export type StatsOverview = {
  range: string;
  series: StatsPoint[];
  summary: StatsSummary;
  topModels: TopModel[];
  scoreDistribution: ScoreDistributionItem[];
};

export class PostgresStatsRepository implements IStatsRepository {
  async getOverview(projectId: string, range: string): Promise<StatsOverview> {
    const bucket = bucketFor(range);
    const start = rangeStart(range).toISOString();

    // series：按时间桶聚合。trace 延迟口径 = max(observations.end_time) - traces.timestamp
    // 用 CTE 先算出每条 trace 的 duration_ms（要求 end_time 非空），再 join observations 聚合 token/cost
    // percentile_cont 要求 ORDER BY 列非空，CTE 里已用 end_time IS NOT NULL 过滤
    const seriesRows = (await db.execute(sql`
      WITH trace_dur AS (
        SELECT t.id, t.timestamp,
          EXTRACT(EPOCH FROM (max(o.end_time) - t.timestamp)) * 1000 AS duration_ms
        FROM ${schema.traces} t
        JOIN ${schema.observations} o ON o.trace_id = t.id
        WHERE o.end_time IS NOT NULL AND t.project_id = ${projectId}
        GROUP BY t.id, t.timestamp
      )
      SELECT
        date_trunc(${bucket}, td.timestamp) AS bucket,
        count(*) AS trace_count,
        percentile_cont(0.5)  WITHIN GROUP (ORDER BY td.duration_ms) AS p50,
        percentile_cont(0.9)  WITHIN GROUP (ORDER BY td.duration_ms) AS p90,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY td.duration_ms) AS p99,
        coalesce(sum(o.prompt_tokens), 0)     AS prompt_tokens,
        coalesce(sum(o.completion_tokens), 0) AS completion_tokens,
        coalesce(sum(o.total_cost), 0)        AS total_cost
      FROM trace_dur td
      LEFT JOIN ${schema.observations} o ON o.trace_id = td.id
      WHERE td.timestamp >= ${start}
      GROUP BY bucket ORDER BY bucket
    `)) as any[];

    const series: StatsPoint[] = seriesRows.map((r: any) => ({
      bucket: new Date(r.bucket as string).toISOString(),
      traceCount: Number(r.trace_count),
      p50LatencyMs: r.p50 === null ? null : Math.round(Number(r.p50)),
      p90LatencyMs: r.p90 === null ? null : Math.round(Number(r.p90)),
      p99LatencyMs: r.p99 === null ? null : Math.round(Number(r.p99)),
      promptTokens: Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      totalCost: String(r.total_cost),
    }));

    // summary：全 range 汇总。trace 数从 traces 表直接 count；token/cost 从 observations 聚合
    const [summaryRow] = (await db.execute(sql`
      SELECT
        count(DISTINCT t.id) AS total_traces,
        coalesce(sum(o.prompt_tokens), 0) + coalesce(sum(o.completion_tokens), 0) AS total_tokens,
        coalesce(sum(o.total_cost), 0) AS total_cost
      FROM ${schema.traces} t
      LEFT JOIN ${schema.observations} o ON o.trace_id = t.id
      WHERE t.project_id = ${projectId} AND t.timestamp >= ${start}
    `)) as any[];

    // 平均延迟：把每条 trace 的 duration 求平均
    const [latencyRow] = (await db.execute(sql`
      SELECT avg(duration_ms) AS avg_latency
      FROM (
        SELECT EXTRACT(EPOCH FROM (max(o.end_time) - t.timestamp)) * 1000 AS duration_ms
        FROM ${schema.traces} t
        JOIN ${schema.observations} o ON o.trace_id = t.id
        WHERE o.end_time IS NOT NULL AND t.project_id = ${projectId} AND t.timestamp >= ${start}
        GROUP BY t.id
      ) d
    `)) as any[];

    const summary: StatsSummary = {
      totalTraces: Number(summaryRow?.total_traces ?? 0),
      totalTokens: Number(summaryRow?.total_tokens ?? 0),
      totalCost: String(summaryRow?.total_cost ?? 0),
      avgLatencyMs: latencyRow?.avg_latency === null ? null : Math.round(Number(latencyRow.avg_latency)),
    };

    // topModels：observations 按 model 分组，取前 5
    const topModelRows = (await db.execute(sql`
      SELECT o.model AS model, count(*) AS cnt, coalesce(sum(o.total_cost), 0) AS cost
      FROM ${schema.observations} o
      JOIN ${schema.traces} t ON t.id = o.trace_id
      WHERE t.project_id = ${projectId} AND o.model IS NOT NULL AND t.timestamp >= ${start}
      GROUP BY o.model ORDER BY cnt DESC LIMIT 5
    `)) as any[];

    const topModels: TopModel[] = topModelRows.map((r: any) => ({
      model: r.model as string,
      count: Number(r.cnt),
      cost: String(r.cost),
    }));

    // scoreDistribution：scores 按 name 分组
    const scoreRows = (await db.execute(sql`
      SELECT name, avg(value) AS avg_value, count(*) AS cnt
      FROM ${schema.scores}
      WHERE project_id = ${projectId} AND created_at >= ${start}
      GROUP BY name ORDER BY cnt DESC
    `)) as any[];

    const scoreDistribution: ScoreDistributionItem[] = scoreRows.map((r: any) => ({
      name: r.name as string,
      avgValue: Number(r.avg_value),
      count: Number(r.cnt),
    }));

    return { range, series, summary, topModels, scoreDistribution };
  }
}
