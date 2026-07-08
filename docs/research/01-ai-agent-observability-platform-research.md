# AI Agent 可观测性平台调研报告

> 项目：OpenAgentTelemetry
> 目标：构建一个类似 LangSmith 的 AI Agent 可观测性平台
> 调研范围：LangSmith 及同类 LLM/AI Agent 可观测性平台的横向对比，涵盖核心能力、追踪机制、数据模型、关键特性、部署方式、定价模型与优劣势，并附带 OpenTelemetry GenAI 语义规范的说明。
> 本文档作为后续系统设计的参考依据。

---

## 一、背景与术语对齐

在进入各产品对比前，先统一几个核心术语，因为不同厂商用词略有差异：

| 概念 | LangSmith | Langfuse | Phoenix / OTel | 说明 |
|------|-----------|----------|----------------|------|
| 一次完整调用链 | **Trace** | Trace | Trace | 一个请求/会话的根 |
| 链中的单个步骤 | **Run** | Observation（span/event） | Span | LLM 调用、工具调用、检索等 |
| 父子关系 | Run tree | Observation tree | Span parent/child | 形成有向无环树 |
| 元数据 | metadata KV | metadata KV | attributes | 任意键值 |

现代平台几乎都已向 **OpenTelemetry（OTel）** 的 "Trace / Span" 模型收敛，差异主要在于 SDK 层、语义约定扩展和上层产品能力（评估、数据集、提示词管理、分析等）。

---

## 二、OpenTelemetry GenAI 语义规范（事实标准基石）

### 2.1 是什么

OpenTelemetry 社区在 `opentelemetry-semantic-conventions` 仓库中维护了一套 **GenAI（生成式 AI）语义约定**，定义了用于描述 LLM / Chat / Embedding / Reranking 等调用的标准 Span 属性。目标是让任何 LLM 提供商（OpenAI、Anthropic、Cohere 等）的遥测数据都用统一字段表达，从而实现厂商无关的可观测性。

### 2.2 核心属性（节选，`gen_ai.*` 命名空间）

- **系统信息**
  - `gen_ai.system`：`openai` / `anthropic` / `azure.ai.openai` 等
  - `gen_ai.request.model`：请求的模型名（如 `gpt-4o`）
  - `gen_ai.response.model`：实际响应模型（可能因路由不同）
- **请求参数**
  - `gen_ai.request.max_tokens`、`gen_ai.request.temperature`、`gen_ai.request.top_p`
  - `gen_ai.request.frequency_penalty`、`gen_ai.request.presence_penalty`
  - `gen_ai.request.stop_sequences`
- **Token 用量**
  - `gen_ai.usage.input_tokens`（旧 `prompt_tokens`）
  - `gen_ai.usage.output_tokens`（旧 `completion_tokens`）
  - `gen_ai.usage.cached_tokens`
- **消息内容（可选，受采样控制）**
  - `gen_ai.prompt`（事件形式，`gen_ai.system.message`、`gen_ai.user.message`、`gen_ai.choice`）
  - `gen_ai.completion`
- **工具调用**
  - `gen_ai.tool.name`、`gen_ai.tool.description`、`gen_ai.tool.call.id`
  - Tool 定义放在 `gen_ai.request.available_tools`
- **流式**：通过事件（events）逐 chunk 记录，或聚合后记录

### 2.3 Span 类型（`span.kind` / 操作类型）

约定定义了若干逻辑操作 span：
- `chat`（对话补全）
- `text_completion`（旧式补全）
- `embeddings`
- `rerank`
- `execute_tools`（工具执行）

### 2.4 稳定性

- 该规范仍在演进中（标记为 *experimental*，命名空间以 `gen_ai.*` 为前缀）。
- 2024–2025 年经历了一次较大重构：从扁平属性（如 `gen_ai.prompt`）转向 **基于事件的 `gen_ai.*.message`** 形式，以更好支持多模态。
- 兼容方式：多数采集器同时输出新旧属性以平滑过渡。

### 2.5 对本项目意义

- **自建可观测平台时，强烈建议原生兼容 OTel GenAI 语义约定**，这样可以直接接入 OpenLLMetry、OTel SDK、各家云厂商的导出器，零成本接入生态。
- Langfuse、Phoenix、OpenLLMetry、Datadog 都已声明支持（或正在支持）该规范。LangSmith 是少数以自家 Run 模型为主、对 OTel 仅做 "桥接" 的平台。

---

## 三、LangSmith（LangChain 官方）

### 3.1 定位

LangChain 团队推出的 **LLM 应用全生命周期平台**：调试 → 测试 → 评估 → 监控 → 提示词管理 → 部署。与 LangChain 框架深度集成，但也支持任意 Python/JS 应用。

### 3.2 核心能力

- **Tracing**：树状 Run 树，可视化每次调用的全链路（LLM、Retriever、Tool、Chain、Agent 步骤）。
- **Evaluation（Evaluation / Datasets）**：
  - 把生产 Trace 一键转为 **Dataset**（测试集）。
  - 用自定义 evaluator（函数 / LLM-as-judge / 启发式）对每次 run 评分。
  - 支持 CI 集成（pytest 插件），比对模型/提示词版本回归。
- **Prompt Hub / Prompt Management**：版本化、环境标签（staging/production）、动态拉取到运行时（`pull` / `push`）。
- **Playground**：在 UI 内调试 prompt + model 组合。
- **Online & Offline Evaluation**。
- **Monitoring / Analytics**：token 用量、延迟、错误率、自定义 dashboard。
- **Replay**：可对历史 trace 重放以验证新改动。
- **Agent Review**：针对 agent 多步决策的专项分析。

### 3.3 追踪机制（SDK 为主）

- **主路径：自家 SDK（`langsmith` 包 + LangChain 的 `@traceable` / `traceable` 装饰器 / RunTree API）**。
- Python/JS 双语言 SDK，通过环境变量启用：
  ```
  export LANGCHAIN_TRACING_V2=true
  export LANGCHAIN_API_KEY=...
  export LANGCHAIN_PROJECT=my-project
  ```
- LangChain 框架内置 instrumentation，**零代码**即可追踪。
- 非 LangChain 应用：用 `@traceable` 装饰器手动包裹函数，或用 `RunTree` API 手动构造运行树。
- **OTel 桥接**：通过 `OTEL_EXPORTER_OTLP_ENDPOINT` 把 OTel 数据接入 LangSmith（较新功能）。但原生数据模型仍是 Run，不是 OTel Span。

### 3.4 数据模型

- **Run**：核心实体。字段：
  - `id`、`run_id`、`parent_run_id`（构成树）
  - `name`、`run_type`（`llm` / `chain` / `tool` / `retriever` / `embedding` / `parser` / `prompt`）
  - `inputs` / `outputs`（任意 JSON）
  - `error`、`extra`（metadata）、`session_name`（thread/会话）
  - `start_time` / `end_time`
  - `dotted_order`：用于高效排序的层级编码（如 `20240101...001.002`）。
- **Dataset / Example**：测试集与样例。
- **Experiment**：在某 dataset 上运行多个目标（target）并比较结果。
- **Feedback**：对 run 的评分（人工或自动 evaluator 写入）。
- **Prompt**：版本化的提示词对象。

### 3.5 部署方式

- **SaaS（默认）**：`smith.langchain.com`。
- **自托管（Self-hosted Enterprise）**：面向企业，可在自有 VPC 内部署，需要 License；后端依赖较重（含 ClickHouse、Kafka、Redis、Postgres 等组件）。

### 3.6 定价（概要，按公开信息）

- **Developer**：免费档，有限额（如 5k traces/月）。
- **Plus**：按席位 + 用量。
- **Enterprise**：自托管 + SSO + SLA。
- 计费维度：保留的 traces、席位（seats）、评估次数、数据存储时长。

### 3.7 优势 / 劣势

**优势**
- 评估 + 数据集 + 提示词管理一体化，**离线开发闭环最强**。
- LangChain 生态零摩擦。
- Playground、CI 评测、agent 分析成熟。
- 文档与社区规模大。

**劣势**
- 对非 LangChain 应用，需手动埋点，体验下降。
- 数据模型是私有 Run 模型，**对 OTel 原生支持是 "二等公民"**。
- 自托管成本高、组件多。
- 厂商锁定风险（提示词、数据集都存在其平台）。
- 闭源。

---

## 四、Langfuse

### 4.1 定位

开源的 **LLM Engineering 平台**，定位与 LangSmith 几乎正面竞争，但 **MIT/Apache 友好开源**，可自托管。是开源阵营中口碑最好的 LangSmith 替代品。

### 4.2 核心能力

- **Tracing**：Trace + Observation（span/event）树。
- **Scores / Evaluations**：手动 / API / model-based evaluator 打分。
- **Datasets**：从 trace 创建测试集，跑离线实验。
- **Prompt Management**：版本化 prompt（`langfuse/prompts`），运行时拉取，支持 JS/Python SDK 与 OpenAI SDK 兼容封装。
- **Analytics**：自定义 dashboard。
- **User / Session 维度**：按用户、会话聚合。
- **Guardrails / 标注工作流**（较新）。
- **Langfuse Data Fetcher / SDK**：用于分析查询。

### 4.3 追踪机制（多通道，OTel 友好）

这是 Langfuse 的关键差异化：

1. **原生 SDK**（Python / JS）：装饰器 `@observe()`，或 OpenAI 包装器（`langfuse.openai` 替换 `openai`，自动埋点）。
2. **Decorator / ctx manager**：手动包裹函数。
3. **OpenAI SDK 兼容封装**：drop-in 替换，自动捕获 prompt/completion/usage。
4. **LangChain / LlamaIndex / Haystack / Vercel AI SDK 集成**。
5. **OpenTelemetry**：
   - Langfuse 提供 **OTLP HTTP endpoint**，可作为 OTel 后端直接接收标准 OTLP 数据。
   - 官方推荐配合 **OpenLLMetry** 或 OTel GenAI SDK 使用。
   - 内部也基于 OTel 概念，对 GenAI 语义约定有良好支持。

### 4.4 数据模型

- **Trace**：根，关联 `user_id`、`session_id`、`metadata`、`tags`、`input`/`output`。
- **Observation**：trace 下的节点，类型为 `span`（有时长）或 `event`（无时长，瞬时）或 `generation`（LLM 调用专用）。
  - 含 `model`、`input`、`output`、`usage`（prompt_tokens / completion_tokens / total / cost）、`level`（DEBUG/INFO/WARNING/ERROR）。
- **Score**：对 trace 或 observation 的评分，含 name、value、comment、数据来源（user / API / eval job）。
- **Dataset / DatasetItem**：测试集。
- **Prompt**：版本化提示词。

### 4.5 部署方式

- **SaaS（Langfuse Cloud）**：US / EU 区域。
- **自托管**：
  - 单容器（含内嵌数据库，演示用）。
  - 生产部署：Docker Compose / Kubernetes，依赖 **Postgres**（主存储）+ 可选 ClickHouse / 自定义存储用于分析；事件经 ingestion-queue 写入。
  - 完全开源，无 License 限制。

### 4.6 定价

- **Self-hosted**：免费（开源）。
- **Cloud Hobby**：免费档。
- **Cloud Pro / Team / Enterprise**：按 events（observations）量阶梯计费，含席位。
- 计费核心维度：**每月 observation 事件数**。

### 4.7 优势 / 劣势

**优势**
- **开源 + 可自托管**，数据主权可控（合规友好）。
- OTel 原生友好（可作为 OTLP 后端）。
- OpenAI drop-in 包装器易用。
- 与 LangSmith 功能高度对标，迭代快。
- 社区活跃，第三方集成多。

**劣势**
- 评估/数据集能力较 LangSmith 略晚成熟（但差距在缩小）。
- Agent 多步分析深度不如 LangSmith 精细。
- 大规模分析需要自配 ClickHouse 等。
- 高级特性（如部分 guardrails）较新。

---

## 五、Phoenix（Arize AI）

### 5.1 定位

Arize AI（原本是传统 ML 监控厂商）推出的 **开源 LLM/GenAI 可观测性平台**。核心特点是 **OTel 原生 + 本地优先 + 强调查询分析**。

### 5.2 核心能力

- **Tracing**：完全基于 **OpenTelemetry**，使用 GenAI 语义约定。
- **LLM Evals**：内置评估器（毒性、相关性、RAG 上下文相关性、幻觉、代码正确性等），可在线/离线运行。
- **Datasets / Experiments**：从 spans 构建数据集，跑实验对比。
- **Prompt Playground**：在 UI 内对历史 span 重放、改 prompt。
- **Analytics**：SQL 风格查询 + 可视化。
- **RAG 专项**：检索质量、上下文相关性、幻觉检测。
- **Embedding 分析**（继承自 Arize 的传统优势）：UMAP 降维、聚类、漂移检测。

### 5.3 追踪机制（OTel 原生）

- **架构：Phoenix 自身就是一个 OTel 后端**（接收 OTLP gRPC/HTTP），并提供查询/可视化 UI。
- 提供 **`arize-phoenix` Python/JS SDK** 与 `openinference` instrumentation（Arize 维护的开源 instrumentation 库，与 OTel GenAI 语义约定兼容）。
  - `openinference-instrumentation-openai`、`-langchain`、`-llama-index`、`-dspy` 等。
- 也可直接用 **任意 OTel SDK + GenAI 语义约定** 发数据给它。
- 支持 **本地内存模式**（notebook 内即可跑）和 **服务化模式**（容器化部署）。

### 5.4 数据模型

- 完全 OTel 模型：**Trace → Span**。
- 用 `openinference.*` 属性作为 GenAI 约定的扩展（与 `gen_ai.*` 平行/映射），涵盖：
  - `llm.*`（model_name、token_count、messages）
  - `retriever.*`（input/output、documents）
  - `tool.*`
  - `chain.*`
  - `embedding.*`、`reranker.*`
- Span kind：`LLM`、`CHAIN`、`TOOL`、`RETRIEVER`、`EMBEDDING`、`RERANKER`、`AGENT`。

### 5.5 部署方式

- **本地（开发）**：`pip install arize-phoenix`，笔记本内一行启动 UI。
- **自托管**：Docker / K8s / Hugging Face Space。
- **Cloud**：Arize 托管版本（与 Arize AX 平台整合）。

### 5.6 定价

- **开源核心完全免费**（Apache 2.0）。
- **Arize 云端**：按数据量/席位，企业级 SSO、长期保留、高级 evals 等付费。

### 5.7 优势 / 劣势

**优势**
- **OTel 原生、最 "标准化"**，无锁定。
- 开源 + 本地 notebook 友好，RAG/embedding 分析强。
- Evals 内置丰富，Prompt Playground 体验好。
- OpenInference instrumentation 覆盖广。

**劣势**
- 提示词管理/数据集生命周期管理不如 Langfuse/LangSmith 完整。
- 非常 Python 中心（JS 支持有但生态偏薄）。
- 生产级规模化部署文档/经验不如商业产品。
- 云端深度能力需付费。

---

## 六、OpenLLMetry（Traceloop）

### 6.1 定位

它**不是平台**，而是 **一个 OTel instrumentation 库 / 采集器**，把 LLM/VectorDB/Framework 的调用自动转为符合 GenAI 语义约定的 OTel spans，导出到任意 OTel 后端。

### 6.2 核心能力

- **自动埋点**：一行启动即可 instrument。
- 覆盖：
  - **LLM 提供商**：OpenAI、Anthropic、Cohere、AI21、Bedrock、VertexAI、Mistral、Groq、ollama 等。
  - **VectorDB**：Pinecone、Qdrant、Weaviate、Milvus、Chroma、pgvector 等。
  - **框架**：LangChain、LlamaIndex、Haystack。
  - **GPU/系统**：可选采集 NVIDIA GPU 指标。
- 导出目标：任意支持 OTLP 的后端（OTel Collector、Jaeger、Datadog、Honeycomb、New Relic、Dynatrace、Splunk、Elastic、Prometheus-tempo、Grafana、SigNoz、Langfuse、Phoenix……）。

### 6.3 追踪机制（纯 OTel）

- 实现：Python / JS SDK + **OTel Collector distribution**（Traceloop 发布的预置 collector 镜像，开箱即用）。
- 完全遵循 **GenAI 语义约定**，并且是该规范的主要贡献者之一。
- 工作方式：monkey-patch 各 SDK 的 HTTP/WS 调用层。

### 6.4 数据模型

- 标准 OTel Trace / Span + `gen_ai.*` 属性（早期使用自家 `traceloop.*` 命名空间，已迁移到 `gen_ai.*`）。

### 6.5 部署方式

- 库：`pip install traceloop-sdk` / `npm i @traceloop/nodejs-sdk`。
- Collector：Traceloop 维护的 OpenTelemetry Collector 发行版。
- SaaS：Traceloop 也提供一个轻量托管面板（非必需）。

### 6.6 定价

- **开源核心免费**（Apache 2.0）。
- Traceloop 云端/企业版付费。

### 6.7 优势 / 劣势

**优势**
- **厂商中立**，无锁定，最大化可移植。
- 覆盖最广（LLM + VectorDB + 框架 + GPU）。
- GenAI 语义约定标杆实现。
- 可与任意后端组合。

**劣势**
- **本身不带 UI/评估/数据集**——需要配合后端（Phoenix / Langfuse / Jaeger / Datadog 等）。
- 埋点深度依赖 monkey-patch，偶有兼容性问题（新版本 SDK 上线滞后）。
- 没有 "产品化" 的评估与提示词管理。
- 适合做**采集层**而非完整方案。

---

## 七、Helicone

### 7.1 定位

以 **LLM 网关 / 代理（proxy）** 为核心切入点的可观测平台。把流量代理化，从而 "零代码" 获得监控、计费、缓存、限流。

### 7.2 核心能力

- **Proxy / Async Proxy / ASGI Middleware**：作为 OpenAI 兼容代理，捕获所有请求。
- **Logging & Monitoring**：请求/响应、token、延迟、成本、错误。
- **Cost & Rate Limiting**：按 key/用户配额与限速。
- **Caching**：内置缓存以降本。
- **Prompt Management / Versioning**（较新）。
- **Experiments / Datasets**（较新，能力在补齐）。
- **Custom Properties**：任意头注入 metadata（如 `Helicone-Property-User`）。
- **Feedback / User ratings**。
- **Router**：多模型/多提供商路由。

### 7.3 追踪机制

- **主路径：HTTP 代理**——把 base_url 指向 Helicone 即可（如 `https://oai.helicone.ai`），对客户端透明。
- **Python/JS SDK**：包装请求。
- **OTel**：支持把数据通过 OTLP 导出，但主要范式是代理。
- 局限：代理方式擅长单跳 LLM 调用，**复杂 agent 多步树状追踪相对弱**（在补齐中）。

### 7.4 数据模型

- 以 **Request**（一次 LLM 调用）为核心，附加：
  - `prompt` / `response`、`model`、`tokens`、`cost`、`latency`
  - properties（KV）、user_id、custom headers
  - parent_request_id（用于简单链路）
- 不是一等公民的 span 树模型。

### 7.5 部署方式

- **SaaS**：默认。
- **自托管**：开源（社区版），Docker；生产规模化需自己运维（含 ClickHouse / Worker / Web 等组件）。

### 7.6 定价

- 免费 + 按请求量/可观测 features 分级；自建免费。

### 7.7 优势 / 劣势

**优势**
- **代理方式零侵入**，5 分钟接入。
- 成本/限流/缓存/路由一体化（很实用）。
- 适合做 **LLM Gateway + 监控** 组合。

**劣势**
- **复杂 agent 树状追踪能力偏弱**。
- 评估/数据集/提示词管理是后补的，成熟度不如 LangSmith/Langfuse。
- 数据模型偏向 "请求日志" 而非 "分布式 trace"。

---

## 八、Weave（Weights & Biases）

### 8.1 定位

W&B 推出的 **轻量级 LLM 应用追踪与评估库**。强调 "开发者人体工学"，与 W&B 实验追踪生态整合。

### 8.2 核心能力

- **Tracing**：`@weave.op()` 装饰器自动追踪任意函数/对象，形成 span 树。
- **Evaluation Framework**：`weave.Evaluation`——内置 dataset + scorer 模式，跑批量评测、对比版本。
- **Datasets**：版本化的数据集（与 W&B Artifacts 整合）。
- **Objects / Models / Prompts 版本化**：可作为版本化对象存入 W&B。
- **Refiners**：对追踪到的对象做后处理（如脱敏、结构化）。
- **与 W&B 生态**：experiments、artifacts、reports 联动，便于研究→生产链路。
- **Replay**：可重放调用。

### 8.3 追踪机制（SDK）

- **主路径：Python SDK（`weave`）**，`@weave.op()` 装饰器。
- 自动捕获函数输入/输出/耗时；对 LLM 客户端（OpenAI 等）有内置追踪。
- 数据存于 W&B 后端（本地模式也支持）。
- **OTel**：不是核心范式，Weave 用自己的对象模型；可导出但非主线。

### 8.4 数据模型

- **Call**（= span）：含 inputs/outputs/summary/children（树）。
- **Op / Object**：可版本化的函数与对象。
- **Dataset / Evaluation**。
- 强调 "对象版本化"（git-like 语义），与 trace 联动。

### 8.5 部署方式

- **SaaS**（W&B 云端，默认）。
- **Dedicated / Enterprise**（W&B 企业部署）。
- 本地（`weave` serverless local）开发可用。

### 8.6 定价

- 随 W&B 计费：免费个人档 + 按席位/用量的企业版；Weave 本身随平台计费。

### 8.7 优势 / 劣势

**优势**
- **`@weave.op()` 极简**，开发者体验极佳。
- 评估框架设计优雅，适合研究型/迭代式团队。
- 与 W&B 强大的实验/工件管理联动。
- 对象版本化理念独特。

**劣势**
- **Python 为主**（JS 弱）。
- 生态相对偏 ML 研究人群，非纯生产 LLM 运维场景。
- 对 OTel 原生支持不是重点。
- 生产监控/告警/规模化运维能力不如 Datadog 类基础设施级平台。
- 闭源。

---

## 九、Datadog AI Monitoring（LLM Observability）

### 9.1 定位

把 LLM/Agent 可观测性**并入企业级可观测平台**。卖点：与基础设施、APM、日志、合成监控、RUM 一体化，跨栈关联。

### 9.2 核心能力

- **LLM Observability**（独立产品线）：traces、token、成本、延迟、错误。
- **AI Integrations**：OpenAI、Anthropic、LangChain、Bedrock、VertexAI、Mistral 等。
- **Eval（LLM-as-judge + 自定义）**。
- **Metrics / Dashboards / Monitors / Alerts**：复用 Datadog 强项。
- **Guardrails 集成**。
- **与 APM Trace 关联**：把 LLM span 嵌入到全链路 trace（从 API 到 DB 到 LLM）。
- **Logs / Incidents / CI Visibility** 联动。

### 9.3 追踪机制（SDK + OTel）

- **SDK**：`ddtrace` 自动 instrument（Python 优先；JS/Go/Java 等）。
- **API 接入**：LLM Observability 提供独立 ingestion API（可发送自定义 span/eval）。
- **OTel 兼容**：Datadog 支持 OTLP ingest，可接收标准 OTel + GenAI 属性。

### 9.4 数据模型

- 标准 Datadog trace/span，LLM 相关 span 携带 GenAI 语义属性。
- 额外实体：**Eval**（对 span 打分）、**Metric**、**Log**。

### 9.5 部署方式

- **纯 SaaS**（Datadog 平台），Agent 部署在用户侧。
- 不支持自托管。

### 9.6 定价

- 按 **LLM Observability span/event 量** + 主机/席位计费。
- 企业级成本通常较高。

### 9.7 优势 / 劣势

**优势**
- **跨栈全链路关联**（APM + Logs + Infra + LLM）独一无二。
- 企业级监控/告警/SSO/合规成熟。
- 大规模、多团队落地友好。

**劣势**
- **闭源、SaaS-only**，数据主权弱。
- 成本高。
- 评估/提示词管理/数据集能力较专精工具浅。
- 对小团队/研究场景偏重。

---

## 十、横向对比总表

| 维度 | LangSmith | Langfuse | Phoenix (Arize) | OpenLLMetry | Helicone | Weave (W&B) | Datadog AI |
|------|-----------|----------|-----------------|-------------|----------|-------------|------------|
| 类型 | 商业 SaaS + 企业自托管 | 开源 + SaaS | 开源 + Cloud | 开源库/采集器 | 开源 + SaaS | 商业 SaaS | 商业 SaaS |
| 主采集方式 | 自家 SDK（RunTree/@traceable） | SDK + OpenAI wrapper + OTLP | OTel 原生（openinference） | OTel（自动 monkey-patch） | HTTP 代理 | `@weave.op()` SDK | ddtrace SDK + OTLP + API |
| OTel 原生 | 桥接（二等） | 良好（OTLP 后端） | 优秀（核心范式） | 优秀（就是 OTel） | 支持 | 否 | 支持 |
| 数据模型 | Run 树 | Trace/Observation | Trace/Span (gen_ai) | Trace/Span | Request 日志 | Call 树 | Trace/Span |
| 评估 Evals | 强（LLM-judge/CI） | 强（scores/eval model） | 内置丰富 | 无（靠后端） | 基础 | 优雅框架 | LLM-judge/自定义 |
| 数据集 Datasets | 强 | 强 | 有 | 无 | 新增 | 强 | 较弱 |
| 提示词管理 | 强（Hub+CI） | 强（版本+运行时拉取） | Playground 为主 | 无 | 新增 | 对象版本化 | 较弱 |
| Replay | 有 | 有 | 有（playground） | 无 | 部分 | 有 | 部分 |
| 分析/监控 | Dashboard | Dashboard + 自定义 | SQL 风格强 | 无（靠后端） | Cost/限流/缓存强 | 与 W&B 联动 | 企业级最强 |
| Agent 多步分析 | 强 | 中 | 中 | 依后端 | 弱 | 中 | 中 |
| RAG/Embedding 分析 | 中 | 中 | 最强 | 依后端 | 弱 | 中 | 中 |
| 自托管 | 企业付费 | 免费开源 | 免费开源 | N/A | 免费开源 | 否 | 否 |
| 语言覆盖 | Py/JS 佳 | Py/JS 佳 | Py 强/JS 一般 | Py/JS/Go 等广 | Py/JS | Py 主 | 多语言 |
| 厂商锁定 | 中-高 | 低 | 低 | 极低 | 中 | 中-高 | 高 |
| 适合人群 | LangChain 用户/全生命周期 | 想自托管的开源团队 | OTel 信徒/RAG 研究 | 想自选后端者 | 成本/网关优先者 | ML 研究迭代团队 | 已用 Datadog 的企业 |

---

## 十一、按场景的选型建议

1. **想要 "全生命周期 + 强评估"，且不介意锁定** → **LangSmith**。
2. **想自托管、数据主权、又要有评估/提示词管理** → **Langfuse**。
3. **认 OTel 标准化、重 RAG/embedding 分析** → **Phoenix**。
4. **只想做采集层、自由接后端** → **OpenLLMetry**（可叠加 Phoenix/Langfuse）。
5. **要 LLM 网关 + 成本/限流/缓存** → **Helicone**。
6. **ML 研究型团队、迭代评估** → **Weave**。
7. **企业全栈可观测 + 已用 Datadog** → **Datadog AI Monitoring**。

**组合范式（越来越流行）**：用 **OpenLLMetry / OpenInference** 采集（OTel GenAI 标准）→ 发到 **Langfuse 或 Phoenix**（自托管后端）→ 必要时再镜像到 **Datadog** 做企业监控。这样既保证标准中立，又获得产品化能力。

---

## 十二、对 OpenAgentTelemetry 项目的设计启示

基于以上调研，给出几条设计原则建议（供后续设计文档参考）：

1. **以 OpenTelemetry 为底座**
   - 数据模型直接采用 **Trace → Span**，遵循 **GenAI 语义约定（`gen_ai.*`）**。
   - 扩展命名空间用于 agent 专属概念（如 `agent.step`、`agent.decision`、`tool.*`、`retriever.*`、`memory.*`），但保持与 `openinference.*` / Langfuse Observation 类型可映射。

2. **采集层与后端解耦**
   - 提供三类采集入口：
     1. **OTLP 接收端**（兼容 OpenLLMetry / 任意 OTel SDK）。
     2. **轻量 SDK**（装饰器 / context manager，类似 `@traceable` / `@observe` / `@weave.op`）。
     3. **框架/提供商自动 instrumentation**（LangChain / LlamaIndex / OpenAI / Anthropic / Bedrock）。

3. **数据模型分层**
   - 物理层：OTel Span。
   - 逻辑层：抽象出 **Trace / Run（=Span 子集分类）/ Generation / ToolCall / Retrieval / AgentStep / Message / Usage / Feedback**。
   - 上层实体：**Dataset / Experiment / Prompt（版本化）/ Eval**。

4. **存储选型**
   - 元数据与关系（trace 索引、prompt 版本、dataset）→ Postgres。
   - 大量 span/事件正文 → **ClickHouse**（Langfuse/Phoenix/Datadog 都倾向列存）或 **Parquet + 对象存储**。
   - 全文/向量检索 → 倒排 + pgvector / Qdrant（用于内容搜索与 RAG 分析）。

5. **产品能力优先级（建议 MVP）**
   - P0：Trace 可视化树、token/cost/延迟、按 user/session 聚合、错误追踪。
   - P1：从 trace 一键建 dataset + LLM-as-judge eval + 简单 prompt playground。
   - P2：Prompt 版本管理 + CI 评测 + replay。
   - P3：Agent 多步决策分析、RAG 质量分析、embedding 可视化。

6. **可移植性**
   - 默认可同时导出到 OTLP（让用户复用 Datadog/Honeycomb/SigNoz），避免 "又一个孤岛"。

7. **部署形态**
   - 单二进制/单容器（开发）+ K8s Helm（生产）+ 可选 SaaS。

---

## 十三、参考与延伸阅读（官方文档入口）

- OpenTelemetry GenAI 语义约定：`opentelemetry.io/docs/specs/semconv/gen-ai/`，仓库 `open-telemetry/semantic-conventions`。
- LangSmith：`docs.smith.langchain.com`
- Langfuse：`langfuse.com/docs`
- Phoenix：`docs.arize.com/phoenix`，`github.com/Arize-ai/phoenix`，`github.com/Arize-ai/openinference`
- OpenLLMetry：`github.com/traceloop/openllmetry`，`www.traceloop.com/docs`
- Helicone：`docs.helicone.ai`
- Weave：`weave-docs.wandb.ai`
- Datadog LLM Observability：`docs.datadoghq.com/llm_observability/`

---

### 备注与时效性

- 以上能力与定价信息基于公开文档与产品发布历史（截至 2025 年初），各平台迭代极快（尤其评估、guardrail、agent 分析等方向），具体落地时应**以官方最新文档为准**。
- GenAI 语义约定仍处于 experimental 阶段，属性命名（如 `gen_ai.prompt` → 事件化）正在迁移，实现时需注意同时输出兼容字段。
