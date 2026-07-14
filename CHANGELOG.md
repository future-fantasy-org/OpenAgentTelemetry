# Changelog

本文件记录 OpenAgentTelemetry 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 已完成里程碑总览

以下里程碑已全部开发完成，尚未发布正式版本（无 git tag）。

---

### M13 — 评估任务 — 2026-07-14

`46bcc54`（设计 spec）· 多次提交实现

#### Added
- **数据库迁移** `0007_eval_tables.sql`：新增 `llm_providers`（全局 Provider）、`evaluators`（项目级评估器）、`eval_jobs`（任务实例）、`eval_job_items`（每条 case 记录）4 张表，含项目维度 + 状态索引
- **AES-256-GCM 加密** `modules/crypto.ts`：Provider API Key 用对称加密存储（可解密用于 LLM 调用），`ENCRYPTION_KEY` 环境变量（32 字节 base64）。格式 `iv(12) + authTag(16) + ciphertext`，全部 base64
- **OpenAI 兼容 LLM 客户端** `modules/llm-client.ts`：统一 openai/custom/ollama 三种 provider，30s AbortController 超时，返回 `{content, promptTokens, completionTokens}`
- **全局 Provider 注册表** `POST/GET/PUT/DELETE /api/eval/providers` + `POST /api/eval/providers/:id/test`（连通性测试）。API Key 永不返回前端，仅返回 `****5678` 预览
- **项目级评估器 CRUD** `POST/GET/PUT/DELETE /api/eval/evaluators`：支持 `llm_judge`（providerId + model + judgePrompt + min/max）和 `numeric_threshold`（metric + operator + threshold + passScore/failScore）两种类型
- **进程内 Worker** `modules/eval-worker.ts`：单例 `EvalWorker`，`MAX_CONCURRENCY=3`，监听 `eval:job-started` 事件，队列 + pump 循环，支持取消。服务器重启时 `interruptRunning()` 清扫 stale 任务（崩溃恢复）
- **任务 API** `POST/GET /api/eval/jobs`、`GET /api/eval/jobs/:id`、`GET /api/eval/jobs/:id/items`（分页 + 状态过滤）、`POST /api/eval/jobs/:id/cancel`、`DELETE /api/eval/jobs/:id`
- **状态机** Job：`pending → running → completed/failed/cancelled/interrupted`；Item：`pending → running → success/failed`。所有 item 终态后自动聚合 summary（avg / passRate / count）
- **每条 case 生成 trace**：评估用例在 DB 事务中生成完整 trace（`metadata.source='eval'`）+ observation（`type='generation'`），可在 Traces 页面逐条调试
- **评分写入**：每个 evaluator 的评分写入 `scores` 表（`source='eval_job'`），与手动评分统一存储
- **SSE 进度流** `GET /api/stream/eval/:jobId`：推送 `eval:item-completed` 和 `eval:job-completed` 事件，按 jobId 过滤
- **5 个前端页面**：
  - `/eval/providers` — Provider 管理（创建/编辑/测试连通性/删除）
  - `/eval/evaluators` — 评估器管理（项目级，类型感知表单）
  - `/eval/jobs` — 任务列表（状态徽章 + 进度）
  - `/eval/jobs/new` — 新建任务（dataset/prompt 版本/provider/evaluator 下拉）
  - `/eval/jobs/[id]` — 任务详情（SSE 实时进度 + summary 表 + item 列表含 trace 跳转）
- **derive-action 扩展**：新增 `eval_provider` / `evaluator` / `eval_job` 三类资源识别 + `/cancel` 路径特殊分支
- **EventBus 新增 3 个事件类型**：`EvalJobStartedEvent`、`EvalItemCompletedEvent`、`EvalJobCompletedEvent`

#### Changed
- `app.ts` AppDeps 新增 4 个可选字段（`providerRepo?` / `evaluatorRepo?` / `evalJobRepo?` / `evalWorker?`），不破坏现有 9 个测试文件的 `makeMockDeps()`
- `server.ts` 启动时初始化 eval 栈并调用 `interruptRunning()` 崩溃恢复
- `schema.ts` 修复 Drizzle ORM `.references()` 的 `onDelete` 语法（应为 options 参数而非链式调用）

#### Security
- Provider API Key 使用 AES-256-GCM 对称加密，`ENCRYPTION_KEY` 从环境变量读取，永不日志/永不返回前端

#### Tests
- 后端 103 个测试全部通过（crypto 6 + llm-client 5 + eval-providers 6 + eval-evaluators 6 + eval-jobs 7 + eval-worker 5 + derive-action 新增 5 + sse 新增 2 + 原有 61）
- 前端 TypeScript 类型检查通过，Next.js build 成功
- `scripts/verify-m13.sh` 端到端验证脚本（登录 → Provider CRUD → Evaluator CRUD → 参数校验 → 可选真实 LLM 端到端）

---

### M8 — 告警系统 — 2026-07-12

`adfeacd`（后端）· `565956c`（集成修复）

#### Added
- **数据库迁移** `0004_alert_tables.sql`：新增 `alert_rules` 表（规则定义）和 `alert_events` 表（触发事件），含项目维度索引
- **告警规则 CRUD**：`GET/POST /api/alerts/rules`、`GET/PUT/DELETE /api/alerts/rules/:id`
- **触发事件查询**：`GET /api/alerts/events?projectId=&limit=`
- **Webhook 手动测试**：`POST /api/alerts/rules/:id/test`
- **4 种指标类型**：`error_rate`（错误率 %）、`p99_latency`（P99 延迟 ms）、`cost_rate`（花费速率 $/min）、`trace_rate`（Trace 速率 次/min）
- **滑动窗口 SQL 聚合**：PostgreSQL `INTERVAL` 时间窗口，窗口大小可配（60s ~ 86400s）
- **阈值比较**：支持 `>` / `>=` / `<` / `<=` 四种运算符
- **实时评估触发**：ingestion 完成后通过 `setImmediate` 非阻塞触发 `AlertEvaluator.evaluate()`
- **60s 内存防抖**：同一规则在冷却期内不重复触发（`Map<ruleId, timestamp>`）
- **Webhook 投递**：10s 超时，投递结果记入 `notification_status`（`sent` / `failed` / `skipped`）
- **前端告警页面** `/alerts`：规则列表 + 创建表单 + 启用/停用切换 + Webhook 测试 + 事件时间线
- **Repository 层**：`PostgresAlertRepository` 实现 `IAlertRepository` 接口
- **AlertEvaluator 模块**：规则拉取 → 指标查询 → 阈值比较 → 防抖 → 发 webhook + 记事件

#### Changed
- `ingestion-service.ts`：构造函数新增可选 `alertEvaluator` 参数，`ingest()` 完成后 `setImmediate` 触发评估
- `app.ts`：`AppDeps` 新增 `alertRepo` + `alertEvaluator`，注册 `buildAlertRoutes`
- `server.ts`：实例化 `PostgresAlertRepository` + `AlertEvaluator` 并注入
- `routes/ingestion.ts`：deps 新增可选 `alertEvaluator`，转发给 `IngestionService`
- 前端所有页面导航栏新增「告警」链接
- 前端 `api.ts`：新增 `put()` / `del()` helper + 告警相关 API 函数

#### Verified
- E2E 验证：创建规则 → 摄取数据 → 事件触发（metricValue=0.4 traces/min，notificationStatus=skipped）
- CRUD 验证：PUT 启用/停用、DELETE 删除均通过
- 类型检查 + lint 全通过，11 个测试全通过

---

### M7 — Python SDK — 2026-07-12

`d8322fe`

#### Added
- **Python SDK 包** `apps/sdk-python`：独立 Python 包，支持 `pip install`
- **`@traceable` 装饰器**：支持同步函数和 `async` 异步函数，自动维护父子关系
- **`contextvars` 上下文管理**：Python 的 `AsyncLocalStorage` 等价物，实现自动 parentId 传递
- **`OATClient` 批量客户端**：基于 `threading` 的后台 flush 线程，线程安全缓冲，按数量或时间触发
- **LLM 元数据提取**：自动从函数返回值中提取 `model`、`promptTokens`、`completionTokens`、`totalCost` 到 observation 顶层字段
- **LangChain 集成**：`OATLangChainHandler` 实现 `BaseCallbackHandler`，映射 `on_llm_start/end`、`on_chain_start/end` 等事件
- **E2E 验证脚本** `scripts/verify-python-sdk.py`

#### Dependencies
- Python ≥ 3.9
- 可选依赖：`langchain-core`（LangChain 集成）、`pytest`（开发）

---

### M6 — 用户认证 — 2026-07-09

`0135f11` · `bf8f873`（设计）· `5fc6940`（计划）

#### Added
- **单管理员登录**：邮箱 + 密码认证，argon2 密码哈希（`@node-rs/argon2`，prebuilt napi-rs 无需编译）
- **Cookie + JWT 会话**：httpOnly cookie 存储 JWT，7 天有效期，无状态会话
- **JWT 签发/验证**：使用 `jose` 库（HS256 算法）
- **全局路由守卫**：Fastify `preHandler` 钩子保护所有 `/api/*` 路由，放行名单 `/api/public/*`、`/api/auth/login`、`/health`
- **Admin 引导**：服务启动时从 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 环境变量幂等创建管理员（已存在则跳过，不覆盖密码）
- **前端登录页** `/login`：邮箱密码表单，登录成功重定向到主页
- **Next.js Edge Middleware**：检查 `oat_session` cookie 存在性，未登录重定向到 `/login`
- **数据库迁移** `0003_users.sql`：新增 `users` 表（id, email, passwordHash, role, timestamps）
- **API 端点**：`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`
- **CORS**：启用 `credentials: true`，前端 fetch 携带 cookie
- **测试**：新增 3 个认证测试（无 cookie 401、带 cookie 200、public 摄取 202）

#### Changed
- `server.ts`：新增 `JWT_SECRET` 必填校验（缺失则拒绝启动），新增 `bootstrapAdmin()` 引导逻辑
- `app.ts`：注册 `@fastify/cookie`，注册认证路由 + 全局鉴权钩子，`AppDeps` 新增 `userRepo`
- 前端 API 客户端 `get()` / 新增 `post()`：均加上 `credentials: 'include'`
- `docker-compose.yml`：新增 `JWT_SECRET`、`ADMIN_EMAIL`、`ADMIN_PASSWORD` 环境变量（带默认值）
- 现有 3 个 ingestion-api 测试更新为携带认证 cookie

#### Dependencies
- 新增 `@node-rs/argon2@^2.0.2`、`jose@^6.2.3`、`@fastify/cookie@^9.4.0`

---

### M5 — Dashboard 统计图表 — 2026-07-09

`08f5761`

#### Added
- **统计聚合端点** `GET /api/stats/overview?projectId=&range=`：range 支持 `1h` / `24h` / `7d` / `30d`
- **时间序列聚合**：PostgreSQL `date_trunc` 按时间桶分组，自适应粒度（minute / hour / day）
- **延迟分位数**：`percentile_cont` 计算 p50 / p90 / p99，trace 延迟口径为 `max(observations.end_time) - traces.timestamp`（CTE 预计算）
- **汇总指标**：totalTraces / totalTokens / totalCost / avgLatencyMs
- **Top Models**：按模型分组统计调用次数和成本，取前 5
- **评分分布**：按评分名称分组，展示平均分和次数
- **Dashboard 前端页面** `/dashboard`：6 张 Recharts 图表（Area 调用量、Line p50/p90/p99、堆叠 Bar Token、Area 成本、Bar 评分分布、水平 Bar Top Models）+ 4 张汇总卡片 + 时间范围选择器
- 首页导航栏新增 Dashboard 链接

#### Dependencies
- 新增 `recharts`（web）

---

### M4 — Prompt 管理 — 2026-07-09

`422ad2d`

#### Added
- **数据库迁移** `0002_prompt_tables.sql`：新增 `prompts` 表（逻辑提示词）和 `prompt_versions` 表（版本内容），含 `(prompt_id, version)` 唯一索引
- **版本化**：一个 Prompt 对应多个版本，支持历史回溯
- **变量插值**：`{{name}}` 和 `{{name:default}}` 语法，`renderTemplate()` 实现
- **变量提取**：`extractVariables()` 自动从模板提取变量名列表
- **Label 标记**：版本可打标签（如 `production`），支持 `isActive` 活跃版本切换
- **API 端点**：`GET/POST /api/prompts`、`GET /api/prompts/:id`、`POST /api/prompts/:id/versions`、`POST /api/prompts/:id/render`、`GET /api/prompts/:id/variables`
- **前端页面**：Prompt 列表页 + 详情页（版本列表 + 模板预览 + 变量渲染测试）

---

### M2 + M3 — Tracing 详情 + 数据集/评分 — 2026-07-09

`b891201`

#### Added — M2: Tracing 详情
- **Trace 详情端点** `GET /api/traces/:id`：返回完整 trace + 所有 observations
- **前端 Trace 详情页** `/traces/[id]`：树形结构展示 observation 层级 + waterfall 时间线可视化
- **评分展示**：详情页内按 trace 聚合展示所有评分

#### Added — M3: 数据集与评分
- **数据库迁移** `0001_eval_tables.sql`：新增 `scores` 表（评分，支持 user/api/eval_job 来源）和 `datasets` / `dataset_items` 表（测试集 + 测试样例）
- **评分 API** `POST /api/public/scores`：通过 API Key 给 trace 打分（数值型）
- **评分查询** `GET /api/traces/:id/scores`
- **数据集 CRUD**：`GET/POST /api/datasets`、`GET /api/datasets/:id`、`POST /api/datasets/:id/items`
- **前端页面**：数据集列表页 + 详情页

---

### M1 — 骨架打通 — 2026-07-09

`037e003` → `2641705`（共 11 个提交）

#### Added
- **monorepo 脚手架**：pnpm workspaces，4 个包（`@oat/server`、`@oat/web`、`@oat/sdk-ts`、`@oat/shared`）
- **共享类型包** `@oat/shared`：Ingestion API 契约 + Zod 运行时校验 schema
- **数据库 Schema**：Drizzle ORM 定义 `projects` / `traces` / `observations` 三张核心表
- **初始迁移** `0000_initial.sql`
- **Repository 层**：接口 + Postgres 实现分离（trace-repository、project-repository），预留切换 ClickHouse 的能力
- **后端服务**（Fastify）：
  - `POST /api/public/ingestion`：批量数据接入，API Key 鉴权 + Zod 校验
  - `GET /api/traces`：按 Project 查询 trace 列表
  - `GET /health`：健康检查
  - 闭包工厂模式注入依赖，便于测试 mock
- **TypeScript SDK** `@oat/sdk-ts`：
  - `traceable` 函数装饰器：基于 `AsyncLocalStorage` 自动维护父子关系
  - `OATClient`：批量缓冲 + 定时 flush HTTP 客户端
  - `context.ts`：AsyncLocalStorage 上下文管理
- **前端列表页**（Next.js 14 App Router）：服务端渲染 trace 表格
- **Docker 部署**：`docker-compose.yml`（Postgres + Server + Web），Server / Web Dockerfile + 生产版 Dockerfile.prod
- **种子脚本** `scripts/seed.ts`：数据库迁移 + 演示数据
- **SDK 验证脚本** `scripts/verify-sdk.ts`：端到端验证
- **CI/CD**：GitHub Actions（ci.yml 类型检查+测试、docker-build.yml 镜像构建）
- **测试**：Vitest 单元测试（shared ingestion schema、SDK context/client）

#### Infrastructure
- TypeScript 5.4、Node ≥ 20、pnpm 11
- Fastify 4 + Drizzle ORM 0.31 + postgres 3.4
- Next.js 14 + Tailwind CSS
- Vitest 测试框架

---

### 项目初始化 — 2026-07-08

`1d7fb04`

- Initial commit
- 调研报告：LangSmith / Langfuse / Phoenix / OpenLLMetry / Helicone / Weave / Datadog 横向对比（`2684417`）
- 平台设计规格文档（`bc82190`）
- M1 实现计划（`b7de0e6`）

---

## 版本说明

本项目目前处于 **pre-v1.0.0** 阶段，尚未发布正式版本（无 git tag）。上述里程碑均已完成开发并通过测试，但尚未标记语义化版本号。

待全部功能稳定后将发布 `v1.0.0`。
