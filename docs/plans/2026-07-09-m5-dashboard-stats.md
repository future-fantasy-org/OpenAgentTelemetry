# M5 实施计划：Dashboard 统计图表

> **目标：** 项目级数据洞察 Dashboard — 调用量、延迟分位、Token、成本、评分分布、Top models。
>
> **架构：** 后端新增 `/api/stats/overview` 聚合端点（纯 SQL，不改任何现有表）；前端新增 `/dashboard` 页用 Recharts 渲染。**零 schema 变更，零 auth 耦合，可独立交付。**

---

## 文件结构

### 新建文件
- `apps/server/src/repositories/stats-repository.ts` — 统计仓储（纯 SQL 聚合）
- `apps/server/src/routes/stats.ts` — `GET /api/stats/overview` 路由
- `apps/web/src/app/dashboard/page.tsx` — Dashboard 页（6 图表 + 时间范围选择器）

### 修改文件
- `apps/web/package.json` — 加 `recharts` 依赖
- `apps/web/src/lib/api.ts` — 加 `getStatsOverview()` + 类型
- `apps/web/src/app/page.tsx` — 顶栏加 Dashboard 入口
- `apps/server/src/app.ts` — 注册 stats 路由 + 注入 statsRepo
- `apps/server/src/server.ts` — 实例化 `PostgresStatsRepository`
- `apps/server/src/repositories/index.ts` — 导出 stats 仓储
- `apps/server/tests/ingestion-api.test.ts` — mock 加 statsRepo（AppDeps 扩展）

---

## Task 1: 安装 recharts + 扩展 AppDeps

- [ ] web 装 recharts：`cd apps/web && pnpm add recharts`
- [ ] `stats-repository.ts` 先建接口 + 空实现（让 server 能编译）
- [ ] `app.ts` 的 `AppDeps` 加 `statsRepo: IStatsRepository`，注册 `buildStatsRoutes(deps.statsRepo)`
- [ ] `server.ts` 实例化 `PostgresStatsRepository`
- [ ] `repositories/index.ts` 导出
- [ ] 测试 mock helper `makeMockRepos()` 加 `statsRepo`（返回空对象即可）
- [ ] `pnpm -r lint && pnpm -r test` 全绿

## Task 2: 统计仓储 — range 映射 + 分桶聚合 SQL

**核心：** `getOverview(projectId, range)` 返回 `StatsOverview`。

**range → date_trunc 映射（单测重点）：**
```typescript
function bucketFor(range: string): string {
  switch (range) {
    case '1h':  return 'minute';
    case '24h': return 'hour';
    case '7d':
    case '30d': return 'day';
    default:    return 'hour';
  }
}
function rangeStart(range: string): Date {
  const now = Date.now();
  const ms = { '1h': 3600e3, '24h': 86400e3, '7d': 7*86400e3, '30d': 30*86400e3 }[range] ?? 86400e3;
  return new Date(now - ms);
}
```

**series 聚合 SQL（drizzle 原生 sql 模板）：**
```typescript
// trace 延迟 = max(observations.end_time) - traces.timestamp，用相关子查询算每条 trace 的 duration
// 然后 group by date_trunc(bucket, trace.timestamp)
const rows = await db.execute(sql`
  WITH trace_dur AS (
    SELECT t.id, t.project_id, t.timestamp,
      EXTRACT(EPOCH FROM (max(o.end_time) - t.timestamp)) * 1000 AS duration_ms
    FROM traces t
    JOIN observations o ON o.trace_id = t.id
    WHERE o.end_time IS NOT NULL
    GROUP BY t.id, t.project_id, t.timestamp
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
  LEFT JOIN observations o ON o.trace_id = td.id
  WHERE td.project_id = ${projectId} AND td.timestamp >= ${rangeStart}
  GROUP BY bucket ORDER BY bucket
`);
```

> **注意 percentile_cont 的坑：** 它要求 ORDER BY 列**非空**（duration_ms 来自 max(end_time)-timestamp，CTE 里已保证 end_time 非空）。若某桶无数据，percentile_cont 返回 null，前端兜底显示 0。

- [ ] 写 `stats-repository.test.ts` 单测：bucketFor / rangeStart 映射正确
- [ ] 实现 getOverview（series + summary + topModels + scoreDistribution 四部分查询）
- [ ] `topModels`：observations 按 model 分组 count + sum(cost) LIMIT 5
- [ ] `scoreDistribution`：scores 按 name 分组 avg(value) + count
- [ ] `summary`：totalTraces / totalTokens / totalCost / avgLatencyMs

## Task 3: stats 路由 + 类型导出

- [ ] `routes/stats.ts` 用闭包工厂 `buildStatsRoutes(statsRepo)`
- [ ] `GET /api/stats/overview?projectId=&range=` → 校验 range ∈ {1h,24h,7d,30d}，默认 24h
- [ ] 返回 `{ range, series, summary, topModels, scoreDistribution }`
- [ ] `apps/web/src/lib/api.ts` 加 `StatsOverview` 类型 + `getStatsOverview(projectId, range)`

## Task 4: 前端 Dashboard 页（Recharts）

- [ ] `/dashboard` 页：顶部时间范围选择器（1h/24h/7d/30d，默认 24h）
- [ ] 6 个图表卡片（用 Recharts ResponsiveContainer）：
  - 调用量趋势：`<AreaChart data={series}>` X=bucket Y=traceCount
  - 延迟 p50/p90/p99：`<LineChart>` 三条线
  - Token 用量：`<BarChart stackOffset="sign">` prompt + completion 堆叠
  - 成本趋势：`<AreaChart>` Y=totalCost
  - 评分分布：`<BarChart data={scoreDistribution}>` X=name Y=avgValue
  - Top models：横向 `<BarChart>` 或简单表格
- [ ] summary 区：4 个数字卡片（总 traces / 总 tokens / 总成本 / 平均延迟）
- [ ] 时间范围切换 → 重新 `getStatsOverview`（用 query string state + SSR）

## Task 5: 端到端验证 + 提交

- [ ] 造数据：跑 seed + verify-sdk 产生足够 traces/observations（含 cost、tokens）
- [ ] curl `/api/stats/overview?projectId=<seed>&range=24h` 验证返回结构
- [ ] curl `/dashboard` 验证 SSR HTML 含图表占位
- [ ] `pnpm -r lint && pnpm -r test` 全绿
- [ ] 提交推送：`feat(M5): dashboard 统计图表`
