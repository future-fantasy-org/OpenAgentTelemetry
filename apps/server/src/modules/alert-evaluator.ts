import { db, schema } from '../db/client.js';
import { sql } from 'drizzle-orm';
import type { IAlertRepository, AlertRule } from '../repositories/alert-repository.js';

// 支持的指标类型。每项对应 METRIC_QUERIES 里的一个滑动窗口聚合函数
type Metric = 'error_rate' | 'p99_latency' | 'cost_rate' | 'trace_rate';

// 指标 → SQL 聚合查询的映射。窗口内只算 projectId 范围的数据
// 用 ${schema.xxx} 引用表名（drizzle 渲染为合法标识符），列名直接写 o.xxx / t.xxx
// INTERVAL 用 sql.raw 注入整数秒数，避免被当字符串参数（INTERVAL 不接受 bind 参数）
const METRIC_QUERIES: Record<Metric, (projectId: string, windowSec: number) => Promise<number>> = {
  // 错误率：error 级别 observation 占比 (%)。NULLIF 防止除零
  async error_rate(projectId, windowSec) {
    const rows = (await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE o.level = 'error') * 100.0 / NULLIF(count(*), 0) AS val
      FROM ${schema.observations} o
      JOIN ${schema.traces} t ON t.id = o.trace_id
      WHERE t.project_id = ${projectId}
        AND o.start_time >= now() - INTERVAL '${sql.raw(String(windowSec))} seconds'
    `)) as any[];
    return parseFloat(rows[0]?.val ?? '0') || 0;
  },

  // P99 延迟（ms）：口径与 stats 一致，max(end_time) - trace.timestamp 作为单条 trace 耗时
  async p99_latency(projectId, windowSec) {
    const rows = (await db.execute(sql`
      SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS val
      FROM (
        SELECT EXTRACT(EPOCH FROM (max(o.end_time) - t.timestamp)) * 1000 AS duration_ms
        FROM ${schema.traces} t
        JOIN ${schema.observations} o ON o.trace_id = t.id
        WHERE o.end_time IS NOT NULL AND t.project_id = ${projectId}
          AND t.timestamp >= now() - INTERVAL '${sql.raw(String(windowSec))} seconds'
        GROUP BY t.id, t.timestamp
      ) d
    `)) as any[];
    if (!rows.length || rows[0]?.val === null) return 0;
    return Math.round(parseFloat(rows[0].val)) || 0;
  },

  // 花费速率（每分钟成本）：窗口内 total_cost 求和 × 60 / windowSec，归一化到 per-minute
  async cost_rate(projectId, windowSec) {
    const rows = (await db.execute(sql`
      SELECT coalesce(sum(o.total_cost), 0)::float * 60.0 / ${windowSec} AS val
      FROM ${schema.observations} o
      JOIN ${schema.traces} t ON t.id = o.trace_id
      WHERE t.project_id = ${projectId}
        AND o.start_time >= now() - INTERVAL '${sql.raw(String(windowSec))} seconds'
    `)) as any[];
    return parseFloat(rows[0]?.val ?? '0') || 0;
  },

  // Trace 速率（每分钟 trace 数）：窗口内 trace 计数 × 60 / windowSec
  async trace_rate(projectId, windowSec) {
    const rows = (await db.execute(sql`
      SELECT count(*)::float * 60.0 / ${windowSec} AS val
      FROM ${schema.traces} t
      WHERE t.project_id = ${projectId}
        AND t.timestamp >= now() - INTERVAL '${sql.raw(String(windowSec))} seconds'
    `)) as any[];
    return parseFloat(rows[0]?.val ?? '0') || 0;
  },
};

// operator → JS 比较函数。阈值比较在应用层做（不放进 SQL），便于切库/单测
function compare(operator: string, value: number, threshold: number): boolean {
  switch (operator) {
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
    default:
      return false;
  }
}

/**
 * 告警评估引擎。由 ingestion 触发（setImmediate 非阻塞）：
 *  1. 拉规则 → 2. 跑指标 SQL → 3. 阈值比较 → 4. 防抖 → 5. 发 webhook + 记事件
 * 任何步骤抛错都吞掉，绝不能反噬 ingestion 主路径
 */
export class AlertEvaluator {
  // 规则 id → 上次触发时间戳，内存级防抖（单进程足够；多实例需换 Redis）
  private lastTriggered = new Map<string, number>();
  private cooldownMs: number;

  constructor(
    private repo: IAlertRepository,
    cooldownSeconds = 60,
  ) {
    this.cooldownMs = cooldownSeconds * 1000;
  }

  async evaluate(projectId: string): Promise<void> {
    try {
      const rules = await this.repo.listRules(projectId);
      for (const rule of rules) {
        if (!rule.enabled) continue;
        const queryFn = METRIC_QUERIES[rule.metric as Metric];
        if (!queryFn) continue;

        const metricValue = await queryFn(rule.projectId, rule.windowSeconds);
        const threshold = parseFloat(rule.threshold);
        if (!compare(rule.operator, metricValue, threshold)) continue;

        // 防抖：冷却期内同一规则不重复触发（但仍算"已检查"）
        if (!this.shouldTrigger(rule.id)) continue;

        // webhook 可选：没有配 url 就只记录事件，notification_status = 'skipped'
        let notificationStatus = 'skipped';
        if (rule.webhookUrl) {
          notificationStatus = (await this.fireWebhook(rule, metricValue, threshold))
            ? 'sent'
            : 'failed';
        }

        await this.repo.createEvent({
          ruleId: rule.id,
          projectId: rule.projectId,
          metricValue,
          threshold,
          notificationStatus,
        });
      }
    } catch (err) {
      // 告警评估失败不应影响 ingestion，只记录日志
      console.error('[AlertEvaluator] error:', err);
    }
  }

  // 冷却判断：last + cooldownMs 内返回 false，否则更新时间戳并返回 true
  private shouldTrigger(ruleId: string): boolean {
    const last = this.lastTriggered.get(ruleId);
    const now = Date.now();
    if (last && now - last < this.cooldownMs) return false;
    this.lastTriggered.set(ruleId, now);
    return true;
  }

  // 发 webhook。10s 超时；任何异常都降级为 false（失败由 notification_status 体现）
  private async fireWebhook(
    rule: AlertRule,
    metricValue: number,
    threshold: number,
  ): Promise<boolean> {
    try {
      const payload = {
        event: 'alert.triggered',
        rule: {
          id: rule.id,
          name: rule.name,
          metric: rule.metric,
          operator: rule.operator,
        },
        data: { metricValue, threshold, windowSeconds: rule.windowSeconds },
        triggeredAt: new Date().toISOString(),
      };
      const resp = await fetch(rule.webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  // 手动测试 webhook 连通性（POST /api/alerts/rules/:id/test 用）
  async testWebhook(rule: AlertRule): Promise<boolean> {
    if (!rule.webhookUrl) return false;
    return this.fireWebhook(rule, 0, parseFloat(rule.threshold));
  }
}
