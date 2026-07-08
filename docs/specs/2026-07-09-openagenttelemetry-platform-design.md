# OpenAgentTelemetry 平台设计规格

> 文档状态：已与用户确认设计方向，待评审
> 创建日期：2026-07-09
> 定位：开源、可自托管的 AI Agent 可观测性平台，对标 Langfuse / LangSmith
> 配套调研：[AI Agent 可观测性平台调研报告](../research/01-ai-agent-observability-platform-research.md)

---

## 0. 目标与非目标

### 目标
- 构建一个**开源、可自托管**的 LLM/AI Agent 可观测性平台，数据主权可控、无厂商锁定。
- 提供完整的"**追踪 → 测试 → 评估 → 提示词管理**"开发闭环。
- 优先支持 **TypeScript 与 Python** 两种语言的 SDK，接入成本低（5 分钟可用）。
- 部署简单：单命令 `docker-compose up` 即可跑起全套。

### 非目标（明确 YAGNI，避免范围蔓延）
- 不做 Playground / Replay（留待 MVP 之后）。
- 不做 Agent 多步决策专项分析、RAG/embedding 可视化（UMAP 聚类等）。
- 不做多租户、SSO、计费（开源自托管版不需要）。
- 不在 MVP 阶段引入 ClickHouse（Postgres 扛不住时再通过 Repository 抽象层替换）。

---

## 1. 关键决策摘要

| 维度 | 决策 | 理由 |
|------|------|------|
| 定位 | 开源、可自托管，对标 Langfuse | 数据主权、无锁定、社区友好 |
| 后端语言 | TypeScript / Node.js | 用户指定全栈语言；前后端同构 |
| 后端框架 | **Fastify** | 轻量高性能（Express 2-3x），内置 schema 校验，对新手认知负担低 |
| ORM | **Drizzle ORM** | TS-first、SQL 透明、生成的 SQL 可读、帮助理解数据库行为 |
| 前端 | **Next.js (App Router) + React + shadcn/ui + Tailwind** | TS 全栈标配；shadcn/ui 提供现成仪表盘组件 |
| 数据库 | **PostgreSQL**（单库） | 关系型 + JSONB，结构化与半结构化数据兼顾；Langfuse 早期同款 |
| 任务队列 | **BullMQ + Redis** | Eval、聚合等慢任务异步化；Redis 兼作缓存 |
| 校验 | **Zod** | 运行时类型校验，与 TS 类型双向推导 |
| 仓库 | **pnpm workspaces（Monorepo）** | 前后端 + SDK + 共享类型同库，改动联动 |
| 采集方式 | **自家 SDK 为主（类 LangSmith）**，保留 **OTLP 兼容后门** | SDK 体验优先；OTLP 兼容白捡 OTel 生态 |
| 架构 | **Postgres 单库单体 + Repository 抽象层**（方案 A+） | 部署最简；存储抽象层为未来换 ClickHouse 预留 |
| MVP 功能 | Tracing 可视化 + 数据集/Eval + Prompt 版本管理 | 核心开发闭环；Playground/Replay 后置 |

---

## 2. 技术栈与整体架构

### 2.1 整体架构（逻辑分层）

```
┌─────────────────────────────────────────────────────────────┐
│  用户的 AI Agent 应用（任意 TS/Python 项目）                     │
│        │  装饰器 @trace() / OpenAI wrapper / 手动 API           │
│        ▼                                                     │
│  ┌───────────────┐         ┌──────────────────┐             │
│  │ oat-sdk-ts    │         │ oat-sdk-python   │  ← 多语言 SDK │
│  └──────┬────────┘         └────────┬─────────┘             │
│         │  HTTP(批量上报)            │ OTel OTLP(兼容)        │
│         ▼                          ▼                        │
│  ╔══════════════════════════════════════════════╗           │
│  ║       OpenAgentTelemetry Server (Node)       ║           │
│  ║  ┌────────────────────────────────────────┐  ║           │
│  ║  │ Ingestion API  ← 校验/批量写入/异步化    │  ║           │
│  ║  │ Query API      ← trace 查询/分析/聚合    │  ║           │
│  ║  │ Eval API       ← 数据集/评估任务          │  ║           │
│  ║  │ Prompt API     ← 版本管理/运行时拉取      │  ║           │
│  ║  └────────────────────────────────────────┘  ║           │
│  ║  ┌────────────────────────────────────────┐  ║           │
│  ║  │ Repository 层（接口抽象，未来可换存储）   │  ║           │
│  ║  └────────────────────────────────────────┘  ║           │
│  ╚═══════════════│══════════════════│══════════╝           │
│         PostgreSQL ◄────────────┘  Redis/BullMQ              │
│  ╔══════════════════════════════════════════════╗           │
│  ║       Next.js Web UI（Trace 树/仪表盘/Eval）  ║           │
│  ╚══════════════════════════════════════════════╝           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 关键设计点

- **Repository 抽象层**：所有数据库访问走 `TraceRepository`、`PromptRepository` 等接口，业务逻辑不直接写 SQL。未来加 ClickHouse 只需新增 `ClickHouseTraceRepository` 实现，上层零改动。
- **Ingestion 与 Query 逻辑分离**：写入追求高吞吐（批量、异步），查询追求灵活过滤。物理上同进程（保持部署简单），逻辑上不同路由与策略。
- **异步任务**：Eval、成本聚合等慢任务进 BullMQ，API 立即返回，前端轮询/SSE 获取结果。

---

## 3. 核心数据模型

### 3.1 设计原则

参考 Langfuse 成熟模型，简化命名。核心思想：
- **Trace（追踪）** = 一次完整请求/会话（树根）
- **Observation（观测点）** = trace 里的每一步（树枝/树叶），用 `parentId` 形成父子树
- **Score / Dataset / Prompt** 为评估与提示词管理服务

### 3.2 实体关系

```
Project (项目，隔离边界)
  ├── Trace (一次调用链)
  │     ├── Observation (一个步骤：LLM/Tool/Retriever/...)
  │     └── Score (评估打分)
  ├── Dataset (测试集)
  │     └── DatasetItem (测试样例)
  │           └── ExperimentRun (实验执行结果)
  └── Prompt (提示词)
        └── PromptVersion (版本：v1, v2... 实际内容)
```

### 3.3 主要表结构

**`projects`（项目，数据隔离边界）**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| name | text | "我的客服 Agent" |
| slug | text | URL 友好标识 |
| createdAt / updatedAt | timestamp | |

**`traces`（追踪，调用链的根）**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| projectId | uuid FK | 归属项目 |
| name | text | "客服对话流程" |
| userId | text | 终端用户标识（单独成列以建索引快速查） |
| sessionId | text | 会话标识（多轮对话归组） |
| input | jsonb | 整个 trace 的输入 |
| output | jsonb | 整个 trace 的输出 |
| metadata | jsonb | 任意标签/键值 |
| timestamp | timestamp | 发生时间 |

> `userId`/`sessionId` 单独成列而非进 metadata：这两个维度查询极频繁，必须建索引。

**`observations`（观测点，最重要的表）**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| traceId | uuid FK | 归属哪个 trace |
| parentId | uuid | ⭐ 父节点，构成树（根为 null） |
| type | enum | `span`(有时长步骤) / `event`(瞬时事件) / `generation`(LLM 调用) |
| name | text | "调用 GPT-4o" / "搜索知识库" |
| startTime / endTime | timestamp | 耗时计算 |
| input | jsonb | 该步骤输入（如 prompt） |
| output | jsonb | 该步骤输出（如 completion） |
| model | text | 仅 generation：gpt-4o / claude-3 |
| promptTokens | int | 输入 token |
| completionTokens | int | 输出 token |
| totalCost | numeric | 换算成本（美元） |
| level | enum | debug / info / warning / error |
| metadata | jsonb | |

> `type` 分三种：span（有时长的事）、generation（LLM 调用，记 model/token/cost）、event（瞬时日志点）。用 `parentId` 建树而非嵌套 JSON，便于递归查询与索引。

**`scores`（评估打分）**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| traceId | uuid FK | 可对整个 trace 打分 |
| observationId | uuid FK | 也可对某个 observation 打分 |
| name | text | "helpfulness" / "hallucination" |
| value | numeric | 评分值 |
| comment | text | 评语（可选） |
| source | enum | user / api / eval_job |

**`datasets` / `dataset_items`（测试集）**
- `datasets`: { id, projectId, name, description }
- `dataset_items`: { id, datasetId, input: jsonb, expectedOutput: jsonb }

**`prompts` / `prompt_versions`（提示词版本管理）**
- `prompts`: { id, projectId, name }（逻辑提示词）
- `prompt_versions`: { id, promptId, version: int, template: text, config: jsonb, labels: text[] }

> 拆两张表：一个 prompt 多版本，运行时按 `name + label` 拉取当前生产版本，历史版本保留用于回滚/对比。

### 3.4 索引策略

- `traces(projectId, timestamp desc)` — 列表页"最近 trace"
- `observations(traceId)` — 展开一棵 trace 树
- `observations(parentId)` — 找子节点
- `traces(userId)` / `traces(sessionId)` — 按用户/会话筛选
- JSONB 字段 GIN 索引 — metadata 标签过滤

---

## 4. 数据流

### 4.1 写入流（高吞吐）

```
SDK 调用 ──► 本地批量缓冲(每50条或每1秒) ──► Ingestion API(/api/public/ingestion)
                                              (只校验+入队，立即返回202)
                                                  │
                                                  ▼
                                           BullMQ 队列 ──► Worker 异步写 Postgres
```

- SDK 攒批上报，减少网络往返。
- Ingestion API 只校验 + 入队即返回，不拖慢用户应用。
- DB 写入交后台 worker 异步处理，失败可重试。

### 4.2 查询流（灵活）

```
浏览器 ──► Query API(/api/traces?projectId=..&filters=..)
              ▼
          Repository 层 ──► Postgres
              ▼
          组装 trace 树(trace + 所有 observation 按 parentId 拼树)
              ▼
          返回 JSON ──► 前端渲染瀑布图
```

### 4.3 Eval 流（异步）

```
用户"对数据集跑评估" ──► 创建 EvalJob ──► BullMQ ──► Worker 逐条跑 LLM-judge ──► 写 Scores
```

---

## 5. SDK 设计

### 5.1 三种接入方式

**方式 1：装饰器（最常用）**
```typescript
import { traceable } from '@oat/sdk-ts';

export const answerQuestion = traceable(async (question: string) => {
  const docs = await retrieve(question);
  return await llm.chat(question, docs);
}, { name: 'answerQuestion' });
```
> 嵌套调用 `traceable` 函数时，靠 Node `AsyncLocalStorage` 自动传递上下文，形成父子树。

**方式 2：OpenAI Wrapper（零代码改造）**
```typescript
import { OpenAI } from '@oat/sdk-ts';  // 替换原 import 'openai'
const client = new OpenAI();
// 接口不变，自动上报 model/prompt/completion/tokens/cost
```

**方式 3：手动 API（任意语言）** — 直接 POST `/api/public/ingestion`。

### 5.2 Python SDK（镜像 TS 能力）
```python
from oat import traceable

@traceable(name="answer_question")
async def answer_question(question: str):
    docs = await retrieve(question)
    return await llm.chat(question, docs)
```

### 5.3 SDK 内部结构（TS）
```
oat-sdk-ts/
├── client.ts          # HTTP 客户端，批量上报
├── context.ts         # AsyncLocalStorage，维护父子关系
├── traceable.ts       # 装饰器实现
├── wrappers/openai.ts # OpenAI 自动埋点
├── batch.ts           # 批量缓冲 + 定时 flush
└── transport.ts       # HTTP/OTLP 传输（可切换）
```

### 5.4 OTLP 兼容后门

- Server 同时开 OTLP HTTP 接收端点（`/v1/traces`）。
- 用户不装我们的 SDK，也能用任意 OTel SDK + OpenLLMetry 发数据进来。
- 复用同一套 ingestion 逻辑，低成本获得整个 OTel 生态兼容性。

### 5.5 配置（环境变量）
```bash
OAT_API_KEY=...
OAT_BASE_URL=http://localhost:3000
OAT_PROJECT=customer-service-bot
OAT_ENABLED=true   # 可一键关闭（测试环境）
```

---

## 6. 仓库结构

```
OpenAgentTelemetry/
├── apps/
│   ├── server/              # Fastify 后端
│   │   ├── src/
│   │   │   ├── modules/     # trace / observation / score / dataset / prompt 模块
│   │   │   ├── repositories/# ⭐ Repository 接口 + Postgres 实现
│   │   │   ├── routes/      # Fastify 路由
│   │   │   ├── jobs/        # BullMQ worker（Eval、聚合）
│   │   │   └── db/          # Drizzle schema + migrations
│   │   └── package.json
│   └── web/                 # Next.js 前端
│       └── package.json
├── packages/
│   ├── sdk-ts/              # TypeScript SDK
│   ├── sdk-python/          # Python SDK
│   └── shared/              # 共享类型（API 契约，前后端 + SDK 复用）
├── docs/
├── docker-compose.yml       # 一键起 Postgres + Redis + Server + Web
└── pnpm-workspace.yaml
```

- `apps/` 放可独立部署服务；`packages/` 放被复用库。
- `packages/shared` 放 API 请求/响应 TS 类型，前后端和 SDK 共用一份，改一处全联动。

---

## 7. MVP 分期（4 个里程碑）

| 阶段 | 目标 | 产出 |
|------|------|------|
| **M1：骨架打通** | 脚手架 + 最小 Ingestion + trace 列表 | docker-compose 可起；SDK 上报一条 trace；UI 列表显示 |
| **M2：Tracing 完整** | Observation 树、瀑布图、过滤、token/cost 统计 | 核心 P0 追踪可视化完成 |
| **M3：评估闭环** | Dataset（从 trace 建）+ Eval 任务 + Score 展示 | 数据集 + 评估功能完成 |
| **M4：Prompt 管理** | 版本化存储 + 运行时拉取 + 环境标签 | Prompt 管理完成，MVP 收官 |

> 每个里程碑都是可演示的完整切片。M1 结束即端到端跑通。

---

## 8. 错误处理策略

- **SDK 端**：上报失败永不阻塞用户应用。网络错误→本地重试→超时丢弃+本地日志警告。
- **Server 端**：
  - Ingestion 用 Zod 校验，坏数据返回 400 并记录原因。
  - DB 写入失败→消息重回 BullMQ 重试（指数退避），超次进死信队列。
  - 所有 API 错误统一格式：`{ error: { code, message } }`。
- **Eval 任务**：单条失败不影响整批，记录失败项，返回部分结果 + 失败统计。

---

## 9. 测试策略

| 层 | 工具 | 测什么 |
|----|------|--------|
| 单元测试 | Vitest（TS）/ pytest（Python） | Repository、装饰器上下文传递、成本计算等纯逻辑 |
| API 集成测试 | Vitest + Testcontainers（Postgres） | 端到端：上报→入库→查询，真实 Postgres |
| SDK 测试 | 拦截 HTTP + 断言 payload | SDK 行为、批量、父子树正确 |
| 前端 | Playwright（关键路径） | trace 列表、瀑布图渲染 |

> 用 Testcontainers 起真实 Postgres 测 Repository 层（而非 mock），保证 SQL 行为正确——这是存储抽象层可靠性的前提。

---

## 10. 未来演进（非 MVP）

- **ClickHouse 支持**：当 span 量到千万级，新增 `ClickHouseTraceRepository` 实现，上层零改动。
- **Playground / Replay**：UI 内调试 prompt + model，重放历史 trace。
- **Agent 多步决策分析**、**RAG/embedding 可视化**。
- **导出到 OTLP**：让数据镜像到 Datadog/Honeycomb/SigNoz，避免孤岛。

---

## 附：设计决策的"为什么"

| 决策 | 为什么不选另一条 |
|------|------------------|
| Fastify 而非 NestJS | NestJS 装饰器/DI 体系对新手认知负担高；Fastify 更轻、性能更好 |
| Drizzle 而非 Prisma | Prisma 屏蔽 SQL、复杂查询黑箱；Drizzle 保持 SQL 透明，利于理解与复杂查询 |
| Postgres 单库而非双存储 | MVP 复杂度最低；Repository 抽象层已为未来 ClickHouse 预留，无需现在付复杂度代价 |
| 自家 SDK 为主 + OTLP 兼容 | SDK 体验优先；OTLP 兼容成本极低但白捡 OTel 生态，符合开源竞品定位 |
| `parentId` 建树而非 JSON 嵌套 | 关系型数据库递归查询、子树聚合、索引更灵活 |
