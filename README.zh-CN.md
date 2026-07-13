<div align="center">

# OpenAgentTelemetry

**开源 AI Agent 可观测性平台 · 自托管 · 数据自主**

[![CI](https://github.com/future-fantasy-org/OpenAgentTelemetry/actions/workflows/ci.yml/badge.svg)](https://github.com/future-fantasy-org/OpenAgentTelemetry/actions/workflows/ci.yml)
[![Docker](https://github.com/future-fantasy-org/OpenAgentTelemetry/actions/workflows/docker-build.yml/badge.svg)](https://github.com/future-fantasy-org/OpenAgentTelemetry/actions/workflows/docker-build.yml)
[![License: MIT](https://img.shields.io/github/license/future-fantasy-org/OpenAgentTelemetry?color=yellow)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/future-fantasy-org/OpenAgentTelemetry?style=social)](https://github.com/future-fantasy-org/OpenAgentTelemetry/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/future-fantasy-org/OpenAgentTelemetry)](https://github.com/future-fantasy-org/OpenAgentTelemetry/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/future-fantasy-org/OpenAgentTelemetry)](https://github.com/future-fantasy-org/OpenAgentTelemetry/pulls)
[![Last Commit](https://img.shields.io/github/last-commit/future-fantasy-org/OpenAgentTelemetry)](https://github.com/future-fantasy-org/OpenAgentTelemetry/commits/main)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node-%3E%3D20-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspaces-orange.svg)](https://pnpm.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-%3E%3D15-blue.svg)](https://www.postgresql.org/)
[![Python](https://img.shields.io/badge/Python-%3E%3D3.9-blue.svg)](https://www.python.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

追踪 LLM 调用 · 可视化 Agent 执行链路 · 评估实验效果 · 管理 Prompt 版本

[English](./README.md) | [文档索引](./docs/README.md) | [更新日志](./CHANGELOG.md)

</div>

---

## 目录

- [简介](#简介)
- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [SDK 使用](#sdk-使用)
- [API 参考](#api-参考)
- [项目结构](#项目结构)
- [配置](#配置)
- [开发指南](#开发指南)
- [路线图](#路线图)
- [贡献](#贡献)
- [License](#license)

---

## 简介

OpenAgentTelemetry（简称 OAT）是一个**可自托管的开源 AI Agent 可观测性平台**，对标 [Langfuse](https://langfuse.com) / [LangSmith](https://smith.langchain.com)。

**为什么需要它？** 当你的应用集成了 LLM（大语言模型），一次用户请求背后可能触发数十次 LLM 调用、工具调用、检索操作。这些调用组成了复杂的执行链路（trace）。你需要：

- **看见** 每次 LLM 调用的输入、输出、耗时、token 消耗
- **回溯** 整个 Agent 的执行路径，定位哪一步出了问题
- **评估** 输出质量是否达标，横向对比不同 Prompt / 模型的效果
- **管理** Prompt 模板的版本，支持回滚和 A/B 测试

**为什么选择 OAT？**

| 对比项 | LangSmith | Langfuse | **OAT** |
|--------|-----------|----------|---------|
| 自托管 | ✗ | 商业版 | **✓ 开源免费** |
| 数据自主 | ✗ SaaS | 部分 | **✓ 完全自主** |
| TypeScript 全栈 | ✗ Python | 部分 | **✓ 前后端统一** |
| 部署复杂度 | — | 中（ClickHouse） | **低（单 Postgres）** |

---

## 核心特性

### Tracing 追踪（M1 + M2）

- **SDK 装饰器** — `traceable` 包裹任意 async 函数，基于 `AsyncLocalStorage` 自动维护父子关系，无需手动传 parentId
- **批量上报** — SDK 内置批量缓冲 + 定时 flush，最小化对宿主应用的性能影响
- **Ingestion API** — 高吞吐量数据接入，API Key 鉴权 + Zod 运行时校验
- **Trace 列表** — REST API 按 Project 查询，Next.js 前端服务端渲染表格
- **Trace 详情页** — 树形结构展示 observation 层级，waterfall 时间线可视化耗时，input/output/model/tokens/cost 全量展示

### 评估与评分（M3）

- **数据集管理** — 创建测试集、添加测试样例（input + expectedOutput），支持 CRUD
- **评分 API** — 通过 API Key 给 trace 打分（数值型），支持人工标注和自动化评估
- **评分查询** — 按 trace 聚合所有评分，前端详情页展示

### Prompt 管理（M4）

- **版本化** — 一个 Prompt 对应多个版本，支持回滚和对比
- **变量插值** — `{{name}}` / `{{name:default}}` 语法，支持动态渲染预览
- **变量提取** — 自动从模板提取变量列表，前端据此生成输入表单
- **Label 标记** — 版本可打标签（如 `production`、`experiment`），支持活跃版本切换

### Dashboard 统计图表（M5）

- **时间序列聚合** — 按 1h / 24h / 7d / 30d 时间范围，自适应分桶粒度（minute / hour / day）
- **延迟分位数** — PostgreSQL `percentile_cont` 计算 p50 / p90 / p99 延迟
- **Token 与成本** — prompt_tokens / completion_tokens / total_cost 按时间桶聚合
- **Top Models** — 按模型分组统计调用次数和成本，取前 5
- **评分分布** — 按评分名称分组，展示平均分和次数
- **Recharts 可视化** — Area / Line / Bar 图表，4 张汇总卡片

### 用户认证（M6）

- **单管理员登录** — 邮箱 + 密码，argon2 哈希存储，启动时从环境变量引导创建（幂等）
- **Cookie + JWT** — httpOnly cookie 存 JWT，7 天有效期，无状态会话
- **全局路由守卫** — Fastify preHandler 钩子保护所有 `/api/*`（SDK 摄取和登录接口放行）
- **前端登录守卫** — Next.js Edge Middleware 检查 cookie，未登录重定向到 `/login`

### Python SDK（M7）

- **双语言支持** — 在 TypeScript SDK 之外，提供原生 Python SDK，契合 AI/ML 生态
- **`@traceable` 装饰器** — 包裹同步和异步函数，通过 `contextvars`（Python 的 AsyncLocalStorage 等价物）自动维护父子关系
- **批量客户端** — 后台线程按数量或时间间隔触发 flush（线程安全，不阻塞宿主代码）
- **LLM 元数据提取** — 自动从函数返回值中提取 `model`、`promptTokens`、`completionTokens`、`totalCost` 到 observation 顶层字段
- **LangChain 集成** — `OATLangChainHandler` 实现 `BaseCallbackHandler`，映射 LangChain 的 `on_llm_start` / `on_llm_end` / `on_chain_start` / `on_chain_end` 事件，已有 LangChain 应用零代码改动接入

### 告警系统（M8）

- **实时评估触发** — 数据接入后通过非阻塞的 `setImmediate` 立即触发规则评估（无轮询延迟）
- **4 种指标类型** — `error_rate`（错误率 %）、`p99_latency`（P99 延迟 ms）、`cost_rate`（花费速率 $/min）、`trace_rate`（Trace 速率 次/min）
- **滑动窗口 SQL** — PostgreSQL 时间窗口聚合，窗口大小可配（60s ~ 86400s）
- **阈值比较** — 支持 `>` / `>=` / `<` / `<=` 四种运算符
- **60s 内存防抖** — 同一规则在冷却期内不重复触发（避免告警风暴）
- **Webhook 通知** — 每条规则可配 Webhook URL，触发时 POST JSON payload；UI 提供手动测试按钮
- **事件时间线** — 所有触发事件持久化存储，含 `metricValue`、`threshold`、`notificationStatus`（`sent` / `failed` / `skipped`）
- **前端告警页面** — `/alerts` 页面支持规则 CRUD、启用/停用切换、Webhook 测试、事件时间线展示

### 前端架构（M9）

- **项目选择器** — 共享导航栏中的全局项目选择器，通过 URL 查询参数（`?projectId=...`）持久化选择，首次加载自动选中第一个项目
- **SSR Cookie 转发** — Server Components 调用后端 API 时转发 `oat_session` cookie，无需客户端 fetch 即可保持鉴权上下文
- **API 客户端拆分** — 三文件拆分（`api.shared.ts` 类型定义 / `api.server.ts` 仅服务端调用带 cookie / `api.client.ts` 浏览器调用），防止敏感服务端代码泄漏到客户端 bundle
- **共享导航** — 可复用的 Nav 组件，集成项目选择器 + 页面链接，所有认证页面统一一致
- **路由级守卫** — Next.js middleware 将未认证用户重定向到 `/login?next=...`，保留原始目标 URL 用于登录后跳转
- **Error/Loading 边界** — 每个路由段都有 `error.tsx`、`loading.tsx`、`not-found.tsx`，优雅降级

### 安全加固（M10）

- **API Key SHA-256 哈希化** — API Key 使用 SHA-256 哈希后存储；仅保留最后 4 位字符作为预览供 UI 展示。原始 Key 仅在创建时显示一次，之后不可检索（破坏性迁移 — 旧明文 Key 失效）
- **IDOR 防护** — `preHandler` 钩子校验所有 `/api/*` 路由的 `projectId` 存在性；不存在的 projectId 返回 404，防止数据泄漏
- **分层限流** — 全局限流（100 req/min）+ 按路由覆盖：登录接口 10/min（防暴力破解），数据接入接口 600/min（允许高吞吐 SDK 上报）。通过 Fastify 路由选项配置

---

## 技术栈

| 层级 | 技术选型 | 为什么选它 |
|------|----------|------------|
| **后端** | Fastify | 轻量高性能，内置 schema 校验，比 Express 快 2 倍 |
| **ORM** | Drizzle | SQL 透明，不隐藏数据库行为，类型安全 |
| **数据库** | PostgreSQL | 单库起步，Repository 抽象层预留未来切换 ClickHouse 的能力 |
| **前端** | Next.js 14 (App Router) | SSR 性能好，React 生态成熟 |
| **样式** | Tailwind CSS | 原子化 CSS，开发效率高 |
| **SDK** | TypeScript | 与后端共享 Zod schema，前后端类型一致 |
| **认证** | argon2 + jose | argon2 密码哈希（prebuilt napi-rs），jose 签发/验证 JWT |
| **图表** | Recharts | 声明式 React 图表，Area / Line / Bar 开箱即用 |
| **校验** | Zod | 运行时校验 + TS 类型推导一把梭 |
| **包管理** | pnpm workspaces | 硬链接节省磁盘，workspace 协议管理 monorepo |

---

## 快速开始

### 方式一：Docker Compose（推荐）

```bash
git clone https://github.com/future-fantasy-org/OpenAgentTelemetry.git
cd OpenAgentTelemetry

docker compose up -d
```

启动后访问：

| 服务 | 地址 |
|------|------|
| Web UI | http://localhost:3000/login |
| Server API | http://localhost:3001 |
| PostgreSQL | localhost:5432 |

首次登录使用默认管理员账号：`admin@oat.dev` / `admin123`（可通过环境变量 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 修改）。

### 方式二：本地开发

**前置条件：** Node.js ≥ 20, pnpm ≥ 9, PostgreSQL

```bash
pnpm install

# 1. 启动 Postgres 并创建数据库
createdb oat

# 2. 执行数据库迁移 + 种子数据
DATABASE_URL=postgresql://localhost:5432/oat \
  pnpm --filter @oat/server exec tsx ../../scripts/seed.ts

# 3. 启动后端（终端 1）
DATABASE_URL=postgresql://localhost:5432/oat \
  JWT_SECRET=your-secret-string \
  ADMIN_EMAIL=admin@oat.dev \
  ADMIN_PASSWORD=admin123 \
  pnpm dev:server

# 4. 启动前端（终端 2）
SERVER_URL=http://localhost:3001 pnpm dev:web
```

---

## SDK 使用

### 安装

```bash
pnpm add @oat/sdk-ts
# 或
npm install @oat/sdk-ts
```

### 最简示例

```typescript
import { OATClient, traceable, setDefaultClient, resetTraceId } from '@oat/sdk-ts';

const client = new OATClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'your-api-key',
  flushAt: 50,       // 攒够 50 条上报一次
  flushInterval: 1000, // 或每秒上报一次
});

setDefaultClient(client);
resetTraceId(); // 每次请求开始时重置 traceId

// 用 traceable 包裹任意 async 函数，自动记录执行链路
const greet = traceable(async (name: string) => {
  return `Hello, ${name}!`;
});

await greet('World');
// → trace 自动上报到 OAT 平台
```

### 自动成树

`traceable` 基于 Node.js 的 `AsyncLocalStorage` 自动维护父子关系，**无需手动传 parentId**：

```typescript
const outer = traceable(async () => {
  console.log(getCurrentObservationId()); // 'outer-uuid'
  await inner(); // 子调用自动以 'outer-uuid' 为 parent
});

const inner = traceable(async () => {
  console.log(getCurrentParentId()); // 'outer-uuid'
});
```

### Python SDK

```bash
pip install oat-python
# 含 LangChain 集成：
pip install "oat-python[langchain]"
```

```python
from oat import OATClient, traceable, set_default_client, reset_trace_id

client = OATClient(
    base_url="http://localhost:3001",
    api_key="your-api-key",
    flush_at=50,
    flush_interval=1.0,
)
set_default_client(client)

@traceable(name="greet")
def greet(name: str) -> str:
    return f"Hello, {name}!"

reset_trace_id()
greet("World")  # → trace 自动上报
```

### LangChain 集成（Python）

```python
from oat.integrations.langchain import OATLangChainHandler
from langchain_openai import ChatOpenAI

handler = OATLangChainHandler(project="my-app")
llm = ChatOpenAI(callbacks=[handler])
llm.invoke("Hello!")  # → 自动作为 OAT observation 上报
```

---

## API 参考

> 除 `/api/public/*`（SDK 摄取，走 API Key）、`/api/auth/login` 和 `/health` 外，所有 `/api/*` 路由需要携带登录 cookie（`oat_session` JWT）。

### 健康检查

```
GET /health
→ { "status": "ok" }
```

### 项目

```
GET /api/projects
→ { "projects": [{ "id", "name", "apiKeyPreview", "createdAt" }] }
```

> **限流（M10）：** 所有 `/api/*` 路由均有限流。全局限：100 req/min。按路由覆盖：`POST /api/auth/login` 10/min，`POST /api/public/ingestion` 600/min。超限返回 `429 Too Many Requests`。

### 认证

```
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@oat.dev", "password": "admin123" }

→ { "user": { "id": "...", "email": "...", "role": "admin" } }
  + Set-Cookie: oat_session=<jwt>; HttpOnly; SameSite=Lax; Max-Age=604800

POST /api/auth/logout
→ { "ok": true }

GET /api/auth/me
→ { "user": { "id": "...", "email": "...", "role": "admin" } }
```

### 数据接入（SDK 用，API Key 鉴权）

```
POST /api/public/ingestion
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "batch": [
    {
      "id": "obs-uuid",
      "traceId": "trace-uuid",
      "parentId": null,
      "type": "span",          // span | generation | event
      "name": "llm-call",
      "startTime": "2026-07-09T10:00:00.000Z",
      "endTime": "2026-07-09T10:00:01.500Z",
      "input": { "messages": [...] },
      "output": { "content": "..." },
      "metadata": { "model": "gpt-4o" },
      "level": "default"        // default | debug | warning | error
    }
  ]
}

→ { "accepted": 1 }
```

### Traces 查询

```
GET /api/traces?projectId=<uuid>&limit=50
→ { "traces": [{ "id", "name", "userId", "sessionId", "timestamp" }] }

GET /api/traces/:id
→ { "id", "name", "input", "output", "metadata", "observations": [...] }
```

### 评分

```
POST /api/public/scores
Authorization: Bearer <api-key>

{ "traceId": "...", "name": "helpfulness", "value": 0.85, "comment": "..." }
→ { "id": "..." }

GET /api/traces/:id/scores
→ { "scores": [{ "id", "name", "value", "comment", "source", "createdAt" }] }
```

### 数据集

```
GET /api/datasets?projectId=<uuid>
→ { "datasets": [{ "id", "name", "description", "createdAt" }] }

GET /api/datasets/:id
→ { "dataset": { ... }, "items": [{ "id", "input", "expectedOutput", ... }] }

POST /api/datasets
{ "projectId": "...", "name": "测试集 A", "description": "..." }
→ { "id": "..." }

POST /api/datasets/:id/items
{ "input": { ... }, "expectedOutput": { ... } }
→ { "id": "..." }
```

### Prompt 管理

```
GET /api/prompts?projectId=<uuid>
→ { "prompts": [{ "id", "name", "description", "latestVersion", "updatedAt" }] }

GET /api/prompts/:id
→ { "prompt": { ... }, "versions": [{ "version", "template", "labels", "isActive", ... }] }

POST /api/prompts
{ "projectId": "...", "name": "greeting", "template": "Hello {{name}}!" }
→ { "id": "...", "version": 1 }

POST /api/prompts/:id/versions
{ "template": "Hi {{name:there}}!", "labels": ["production"] }
→ { "version": 2 }

POST /api/prompts/:id/render
{ "variables": { "name": "World" } }
→ { "rendered": "Hello World!", "version": 1 }

GET /api/prompts/:id/variables
→ { "variables": ["name"] }
```

### Dashboard 统计

```
GET /api/stats/overview?projectId=<uuid>&range=24h
// range: 1h | 24h | 7d | 30d

→ {
    "range": "24h",
    "series": [{ "bucket", "traceCount", "p50LatencyMs", "p90LatencyMs", "p99LatencyMs", "promptTokens", "completionTokens", "totalCost" }],
    "summary": { "totalTraces", "totalTokens", "totalCost", "avgLatencyMs" },
    "topModels": [{ "model", "count", "cost" }],
    "scoreDistribution": [{ "name", "avgValue", "count" }]
  }
```

### 告警

```
GET /api/alerts/rules?projectId=<uuid>
 { "rules": [{ "id", "name", "enabled", "metric", "operator", "threshold", "windowSeconds", "webhookUrl", ... }] }

POST /api/alerts/rules
{ "projectId": "...", "name": "高错误率", "metric": "error_rate", "operator": "gt", "threshold": 10, "windowSeconds": 300, "webhookUrl": "https://..." }
 { "id": "...", "enabled": true, ... }

PUT /api/alerts/rules/:id
{ "enabled": false }  // 切换启用状态，或更新任意字段
 { "id": "...", "enabled": false, ... }

DELETE /api/alerts/rules/:id
 (204 No Content)

POST /api/alerts/rules/:id/test
 { "ok": true }  // 手动测试 Webhook 投递

GET /api/alerts/events?projectId=<uuid>&limit=50
 { "events": [{ "id", "ruleId", "metricValue", "threshold", "triggeredAt", "notificationStatus" }] }
```

**支持的指标：** `error_rate` (%)、`p99_latency` (ms)、`cost_rate` ($/min)、`trace_rate` (次/min)

---

## 项目结构

```
OpenAgentTelemetry/
├── apps/
│   ├── server/              # Fastify 后端
│   │   ├── src/
│   │   │   ├── auth/        # 认证模块（JWT 签发/验证 + 全局路由守卫 + IDOR preHandler）
│   │   │   ├── db/          # Drizzle schema + 数据库客户端
│   │   │   ├── repositories/# Repository 层（接口 + Postgres 实现）
│   │   │   │   ├── trace-repository
│   │   │   │   ├── score-repository
│   │   │   │   ├── dataset-repository
│   │   │   │   ├── prompt-repository
│   │   │   │   ├── stats-repository    # Dashboard 统计聚合
│   │   │   │   ├── alert-repository    # 告警规则 + 事件 CRUD
│   │   │   │   ├── project-repository  # 项目列表 + API Key 哈希查找
│   │   │   │   └── user-repository     # 用户认证
│   │   │   ├── routes/      # Fastify 路由
│   │   │   │   ├── health, ingestion, traces, trace-detail
│   │   │   │   ├── scores, datasets, prompts
│   │   │   │   ├── stats    # GET /api/stats/overview
│   │   │   │   ├── alerts   # GET/POST/PUT/DELETE /api/alerts/*
│   │   │   │   ├── projects # GET /api/projects
│   │   │   │   └── auth     # login / logout / me
│   │   │   ├── modules/     # 业务逻辑（IngestionService, AlertEvaluator, API Key 哈希）
│   │   │   └── app.ts       # Fastify 应用工厂（闭包工厂模式注入依赖）
│   │   ├── drizzle/         # 数据库迁移 SQL（0000-0005）
│   │   └── Dockerfile
│   ├── web/                 # Next.js 前端
│   │   ├── src/
│   │   │   ├── app/         # App Router 页面
│   │   │   │   ├── login/   # 登录页
│   │   │   │   ├── dashboard/  # 统计图表（Recharts）
│   │   │   │   ├── traces/  # 列表 + [id] 详情
│   │   │   │   ├── datasets/
│   │   │   │   ├── prompts/
│   │   │   │   └── alerts/  # 告警规则 + 事件时间线
│   │   │   ├── lib/         # API 客户端
│   │   │   └── middleware.ts  # Edge 登录守卫
│   │   └── Dockerfile
│   ├── sdk-ts/              # TypeScript SDK
│   │   └── src/
│   │       ├── context.ts   # AsyncLocalStorage 上下文管理
│   │       ├── client.ts    # 批量缓冲 HTTP 客户端
│   │       └── traceable.ts # 函数装饰器
│   └── sdk-python/          # Python SDK
│       └── src/oat/
│           ├── context.py       # contextvars 上下文管理
│           ├── client.py        # 批量缓冲 HTTP 客户端（threading）
│           ├── traceable.py     # @traceable 装饰器（同步 + 异步）
│           └── integrations/
│               └── langchain.py # LangChain BaseCallbackHandler
├── packages/
│   └── shared/              # 共享 Zod schema + 类型定义
├── scripts/
│   ├── seed.ts              # 数据库迁移 + 种子数据
│   └── verify-sdk.ts        # SDK 端到端验证脚本
├── docs/                    # 设计规格、调研报告、实现计划
├── docker-compose.yml
└── pnpm-workspace.yaml
```

---

## 配置

### 环境变量

| 变量 | 服务 | 默认值 | 说明 |
|------|------|--------|------|
| `DATABASE_URL` | server | — | PostgreSQL 连接串 |
| `PORT` | server | `3001` | 后端监听端口 |
| `JWT_SECRET` | server | — | **必填**。JWT 签名密钥，生产环境务必设为随机长字符串 |
| `ADMIN_EMAIL` | server | `admin@oat.dev` | 引导管理员邮箱，启动时若不存在则自动创建 |
| `ADMIN_PASSWORD` | server | `admin123` | 引导管理员密码，仅在首次创建时使用（不覆盖已存在用户） |
| `SERVER_URL` | web | `http://localhost:3001` | 前端 SSR 访问后端的地址 |
| `OAT_BASE_URL` | sdk | — | SDK 上报目标地址 |
| `OAT_API_KEY` | sdk | — | SDK 鉴权 API Key |

---

## 开发指南

```bash
# 安装依赖
pnpm install

# 运行全部测试
pnpm test

# 类型检查
pnpm lint

# 启动后端开发服务器（热重载）
pnpm dev:server

# 启动前端开发服务器
pnpm dev:web
```

### 测试策略

| 层级 | 工具 | 范围 |
|------|------|------|
| 单元测试 | Vitest | Zod schema 校验、SDK 上下文、批量客户端 |
| 集成测试 | Vitest | Repository 层（需真实 Postgres） |
| API 测试 | Vitest + Fastify inject | 路由 + 鉴权 + 校验（内存模式） |
| 端到端 | scripts/ | SDK → Server → DB → Web 全链路 |

---

## 路线图

- [x] **M1 — 骨架**：monorepo + DB + Server + SDK + Web + Docker
- [x] **M2 — Tracing 完整版**：trace 详情页、树形结构、waterfall 时间线
- [x] **M3 — 数据集 + 评分**：测试集 CRUD、评分 API、评分查询
- [x] **M4 — Prompt 管理**：版本化、变量插值、Label 标记、渲染预览
- [x] **M5 — Dashboard 统计图表**：时间序列聚合、延迟分位数、Token/成本、Top Models、评分分布
- [x] **M6 — 用户认证**：单管理员登录、Cookie+JWT、全局路由守卫、前端登录守卫
- [x] **M7 — Python SDK**：`@traceable` 装饰器、批量客户端、LLM 元数据提取、LangChain 集成
- [x] **M8 — 告警系统**：实时评估触发、4 种指标、滑动窗口 SQL、Webhook 通知、事件时间线
- [ ] **未来**：OTLP 兼容、多租户组织、评估任务、ClickHouse 迁移

---

## 贡献

欢迎提交 Issue 和 PR！

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feat/amazing-feature`）
3. 提交更改（`git commit -m 'feat: add amazing feature'`）
4. 推送到分支（`git push origin feat/amazing-feature'`）
5. 开启 Pull Request

**提交规范**（Conventional Commits）：

| 前缀 | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `refactor` | 重构 |
| `test` | 测试相关 |
| `chore` | 构建/工具变更 |

---

## License

[MIT](LICENSE) © 2026 future-fantasy-org
