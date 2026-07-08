# OpenAgentTelemetry 文档

类似 LangSmith 的开源 AI Agent 可观测性平台。

## 目录结构

```
docs/
├── README.md                    # 本文件（文档索引）
├── research/                    # 调研文档
│   └── 01-ai-agent-observability-platform-research.md
└── specs/                       # 设计规格文档（后续补充）
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

### 实现计划（plans/）

| 文档 | 说明 |
|------|------|
| [M1：骨架打通](./plans/2026-07-09-m1-skeleton.md) | MVP 第一里程碑：pnpm 脚手架 → shared 类型 → Drizzle schema → Repository → Fastify Ingestion API → TS SDK → Next.js 列表页 → docker-compose 端到端验证 |
