# OpenAgentTelemetry 文档

类似 LangSmith 的开源 AI Agent 可观测性平台。

## 目录结构

```
docs/
├── README.md                    # 本文件（文档索引）
├── research/                    # 调研文档
│   └── 01-ai-agent-observability-platform-research.md
├── specs/                       # 设计规格文档
│   ├── 2026-07-09-openagenttelemetry-platform-design.md
│   ├── 2026-07-09-auth-dashboard-design.md
│   └── 2026-07-12-python-sdk-alerting-design.md
└── plans/                       # 实现计划文档
    ├── 2026-07-09-m1-skeleton.md
    ├── 2026-07-09-m2-m3-tracing-eval.md
    ├── 2026-07-09-m5-dashboard-stats.md
    ├── 2026-07-09-m6-admin-auth.md
    ├── 2026-07-12-m7-python-sdk.md
    └── 2026-07-12-m8-alerting.md
```

## 文档列表

### 调研文档（research/）

| 文档 | 说明 |
|------|------|
| [AI Agent 可观测性平台调研报告](./research/01-ai-agent-observability-platform-research.md) | LangSmith、Langfuse、Phoenix、OpenLLMetry、Helicone、Weave、Datadog 的横向对比，含 OTel GenAI 语义规范分析与设计启示 |

### 设计规格（specs/）

| 文档 | 说明 |
|------|------|
| [OpenAgentTelemetry 平台设计规格](./specs/2026-07-09-openagenttelemetry-platform-design.md) | 平台整体设计：技术栈、架构、数据模型、数据流、SDK 设计、仓库结构、MVP 分期、错误处理与测试策略 |
| [认证 + Dashboard 设计规格](./specs/2026-07-09-auth-dashboard-design.md) | M5 Dashboard 统计图表 + M6 单管理员认证的设计：Cookie+JWT 会话、argon2 密码哈希、全局路由守卫、统计聚合 SQL、Recharts 图表方案 |
| [Python SDK + 告警系统设计规格](./specs/2026-07-12-python-sdk-alerting-design.md) | M7 Python SDK（contextvars + @traceable + LangChain）+ M8 告警系统（实时评估引擎 + 滑动窗口 SQL + Webhook）的设计 |

### 实现计划（plans/）

| 文档 | 说明 |
|------|------|
| [M1：骨架打通](./plans/2026-07-09-m1-skeleton.md) | MVP 第一里程碑：pnpm 脚手架 → shared 类型 → Drizzle schema → Repository → Fastify Ingestion API → TS SDK → Next.js 列表页 → docker-compose 端到端验证 |
| [M2 + M3：Tracing 详情 + 数据集评分](./plans/2026-07-09-m2-m3-tracing-eval.md) | Trace 详情页（树形结构 + waterfall）、评分 API、数据集 CRUD |
| [M5：Dashboard 统计图表](./plans/2026-07-09-m5-dashboard-stats.md) | Stats Repository（CTE + percentile_cont + date_trunc）、stats 路由、Dashboard 前端（Recharts 6 图表 + 汇总卡片 + 时间范围选择器） |
| [M6：用户认证](./plans/2026-07-09-m6-admin-auth.md) | users 表迁移、JWT 签发/验证（jose）、argon2 密码哈希、全局 preHandler 路由守卫、admin 引导、前端登录页 + Edge middleware |
| [M7：Python SDK](./plans/2026-07-12-m7-python-sdk.md) | Python SDK 包脚手架、contextvars 上下文管理、批量客户端（threading）、@traceable 装饰器（同步+异步）、LangChain BaseCallbackHandler 集成 |
| [M8：告警系统](./plans/2026-07-12-m8-alerting.md) | alert_rules/alert_events 表迁移、Alert Repository、AlertEvaluator（4 指标滑动窗口 SQL + 60s 防抖 + Webhook）、REST API、前端告警页面 |

## 里程碑总览

| 里程碑 | 状态 | 说明 |
|--------|------|------|
| M1 — 骨架 | ✅ 完成 | monorepo + DB + Server + SDK + Web + Docker |
| M2 — Tracing 完整版 | ✅ 完成 | trace 详情页、树形结构、waterfall 时间线 |
| M3 — 数据集 + 评分 | ✅ 完成 | 测试集 CRUD、评分 API、评分查询 |
| M4 — Prompt 管理 | ✅ 完成 | 版本化、变量插值、Label 标记、渲染预览 |
| M5 — Dashboard 统计图表 | ✅ 完成 | 时间序列聚合、延迟分位数、Token/成本、Top Models |
| M6 — 用户认证 | ✅ 完成 | 单管理员登录、Cookie+JWT、路由守卫 |
| M7 — Python SDK | ✅ 完成 | @traceable 装饰器、批量客户端、LLM 元数据提取、LangChain 集成 |
| M8 — 告警系统 | ✅ 完成 | 实时评估触发、4 指标滑动窗口、Webhook、事件时间线 |
| 未来 | 规划中 | OTLP 兼容、多租户组织、评估任务、ClickHouse 迁移 |
