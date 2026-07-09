<div align="center">

# OpenAgentTelemetry

**开源 AI Agent 可观测性平台 · 自托管 · 数据自主**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-green.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

追踪 LLM 调用 · 可视化 Agent 执行链路 · 评估实验效果 · 管理 Prompt 版本

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

### 已完成（M1 骨架）

- **Tracing 追踪** — 通过 SDK 装饰器自动记录 LLM/Agent 调用链路，支持父子关系自动成树
- **批量上报** — SDK 内置批量缓冲 + 定时 flush，最小化对宿主应用的性能影响
- **Ingestion API** — 高吞吐量数据接入，API Key 鉴权 + Zod 运行时校验
- **Traces 查询** — REST API 按 Project 查询 trace 列表
- **Web 可视化** — Next.js 前端，服务端渲染 trace 列表表格
- **一键部署** — docker-compose 包含 Postgres + Server + Web

### 规划中（M2 — M4）

- **Trace 详情页** — 树形结构 + waterfall 时间线，展示每个 observation 的 input/output
- **数据集 + Eval** — 构建测试数据集，批量运行评估器，量化输出质量
- **Prompt 管理** — 模板版本化、变量插值、A/B 测试

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
| Web UI | http://localhost:3000 |
| Server API | http://localhost:3001 |
| PostgreSQL | localhost:5432 |

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
DATABASE_URL=postgresql://localhost:5432/oat pnpm dev:server

# 4. 启动前端（终端 2）
SEED_PROJECT_ID=<上一步输出的 projectId> pnpm dev:web
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

---

## API 参考

### 健康检查

```
GET /health
→ { "status": "ok" }
```

### 数据接入

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

### 查询 Traces

```
GET /api/traces?projectId=<uuid>

→ {
    "traces": [
      {
        "id": "...",
        "name": "...",
        "userId": null,
        "sessionId": null,
        "timestamp": "2026-07-09T..."
      }
    ]
  }
```

---

## 项目结构

```
OpenAgentTelemetry/
├── apps/
│   ├── server/              # Fastify 后端
│   │   ├── src/
│   │   │   ├── db/          # Drizzle schema + 数据库客户端
│   │   │   ├── repositories/# Repository 层（接口 + Postgres 实现）
│   │   │   ├── routes/      # Fastify 路由（health, ingestion, traces）
│   │   │   ├── modules/     # 业务逻辑（IngestionService）
│   │   │   └── app.ts       # Fastify 应用工厂（闭包工厂模式注入依赖）
│   │   ├── drizzle/         # 数据库迁移 SQL
│   │   └── Dockerfile
│   ├── web/                 # Next.js 前端
│   │   ├── src/
│   │   │   ├── app/         # App Router 页面
│   │   │   └── lib/         # API 客户端
│   │   └── Dockerfile
│   └── sdk-ts/              # TypeScript SDK
│       └── src/
│           ├── context.ts   # AsyncLocalStorage 上下文管理
│           ├── client.ts    # 批量缓冲 HTTP 客户端
│           └── traceable.ts # 函数装饰器
├── packages/
│   └── shared/              # 共享 Zod schema + 类型定义
├── scripts/
│   ├── seed.ts              # 数据库迁移 + 种子数据
│   └── verify-sdk.ts        # SDK 端到端验证脚本
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
| `SERVER_URL` | web | `http://localhost:3001` | 前端 SSR 访问后端的地址 |
| `SEED_PROJECT_ID` | web | — | 默认展示的 Project ID |
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
- [ ] **M2 — Tracing 完整版**：trace 详情页、树形结构、waterfall 时间线
- [ ] **M3 — 数据集 + Eval**：测试集 CRUD、评估器框架、批量评估
- [ ] **M4 — Prompt 管理**：版本化、变量插值、A/B 测试
- [ ] **未来**：Python SDK、OTLP 兼容、告警系统

---

## 贡献

欢迎提交 Issue 和 PR！

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feat/amazing-feature`）
3. 提交更改（`git commit -m 'feat: add amazing feature'`）
4. 推送到分支（`git push origin feat/amazing-feature`）
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
