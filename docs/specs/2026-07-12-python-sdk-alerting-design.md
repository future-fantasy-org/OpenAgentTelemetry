# M7 Python SDK + M8 Alerting 设计规格

## 概述

本文档覆盖两个独立里程碑：
- **M7 — Python SDK**：核心追踪 + LangChain CallbackHandler 集成
- **M8 — Alerting 告警**：实时流式触发，Webhook 通知

---

## M7：Python SDK

### 目标

让 Python 生态的 LLM/Agent 应用能以最小侵入接入 OAT 平台，功能与 TS SDK 对齐。

### 架构

```
apps/sdk-python/
├── pyproject.toml          # 现代 Python 打包配置（setuptools 后端）
├── src/oat/
│   ├── __init__.py         # 公开 API 导出
│   ├── client.py           # OATClient — 批量缓冲 + 后台 flush 线程
│   ├── context.py          # contextvars 上下文管理（Python 版 AsyncLocalStorage）
│   ├── traceable.py        # @traceable 装饰器（同时支持 sync 和 async 函数）
│   └── integrations/
│       └── langchain.py    # LangChain BaseCallbackHandler 实现
└── tests/
    ├── test_context.py
    ├── test_client.py
    └── test_traceable.py
```

### 核心设计

#### contextvars 上下文管理

Python 的 `contextvars` 是 `AsyncLocalStorage` 的等价物，在 asyncio 和线程中均能正确传播上下文。

```python
import contextvars

_current_observation_id: contextvars.ContextVar[str | None] = contextvars.ContextVar('_current_observation_id', default=None)
_current_trace_id: contextvars.ContextVar[str | None] = contextvars.ContextVar('_current_trace_id', default=None)

def get_current_parent_id() -> str | None:
    return _current_observation_id.get()

def get_or_init_trace_id() -> str:
    tid = _current_trace_id.get()
    if tid is None:
        tid = str(uuid.uuid4())
        _current_trace_id.set(tid)
    return tid

def reset_trace_id(trace_id: str | None = None) -> None:
    _current_trace_id.set(trace_id or str(uuid.uuid4()))
```

#### @traceable 装饰器

使用 `functools.wraps` 保持函数签名，同时支持 sync 和 async：

```python
from functools import wraps
import asyncio

def traceable(fn=None, *, name=None):
    def decorator(func):
        obs_name = name or func.__name__
        if asyncio.iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                return await _run_traceable(func, args, kwargs, obs_name)
            return async_wrapper
        else:
            @wraps(func)
            def sync_wrapper(*args, **kwargs):
                return asyncio.run(_run_traceable(func, args, kwargs, obs_name))
            return sync_wrapper
    if fn is not None:
        return decorator(fn)
    return decorator
```

#### OATClient 批量客户端

后台线程定时 flush，避免阻塞用户代码：

```python
class OATClient:
    def __init__(self, base_url, api_key, flush_at=50, flush_interval=1.0):
        self._batch: list[dict] = []
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._flush_thread.start()

    def enqueue(self, observation: dict) -> None:
        with self._lock:
            self._batch.append(observation)
            if len(self._batch) >= self._flush_at:
                self._do_flush()

    def _flush_loop(self) -> None:
        while not self._stop_event.wait(self._flush_interval):
            self._do_flush()

    def shutdown(self) -> None:
        self._stop_event.set()
        self._do_flush()
```

HTTP 层使用 `urllib.request`（标准库），不依赖 requests/aiohttp，最小化安装依赖。

#### LangChain CallbackHandler

实现 `BaseCallbackHandler`，将 LangChain 的回调事件映射为 OAT observations：

| LangChain 事件 | OAT observation |
|----------------|-----------------|
| `on_llm_start` | 创建 generation 类型 observation |
| `on_llm_end` | 补充 output、token、model |
| `on_chain_start` | 创建 span 类型 observation |
| `on_chain_end` | 补充 output |
| `on_tool_start` | 创建 span 类型 observation |
| `on_tool_end` | 补充 output |
| `on_llm_error` / `on_chain_error` | 设置 level=error |

### 包信息

- 包名：`oat-python`（PyPI 发布名）
- 导入名：`oat`（`from oat import traceable, OATClient`）
- Python 版本：≥ 3.9（contextvars 从 3.7 稳定，3.9 是当前主流下限）
- LangChain 集成作为可选依赖：`pip install oat-python[langchain]`

### 上报协议

与 TS SDK 完全一致，POST `/api/public/ingestion`，payload schema 复用 shared 包的 Zod 定义。Python 侧手写等价的 dict 结构（无需在 Python 端引入 Zod 等价物）。

---

## M8：Alerting 告警

### 目标

当指标（error 率、延迟、成本等）超过阈值时，自动触发 Webhook 通知。

### 架构

```
触发点：IngestionService.createObservations()
         │
         ▼
    AlertEvaluator (非阻塞，fire-and-forget)
         │
         ├── 查询活跃规则
         ├── 计算窗口内指标
         ├── 超阈值 → 写 alert_events + POST webhook
         └── 防抖：同一规则窗口内不重复触发
```

**实时流式方案**：每次 ingestion 请求完成后，在同一个进程内异步触发告警评估（`setImmediate` / 非 `await`），不阻塞 ingestion 响应。用内存 Map 做防抖（每个规则 60 秒内最多触发一次）。

### 数据模型

```sql
-- 0004_alert_tables.sql

CREATE TABLE alert_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  metric      TEXT NOT NULL,         -- error_rate | p99_latency | cost_rate | trace_rate
  operator    TEXT NOT NULL,          -- gt | gte | lt | lte
  threshold   NUMERIC NOT NULL,
  window_seconds INTEGER NOT NULL DEFAULT 300,  -- 滑动窗口（秒）
  webhook_url TEXT,                   -- 通知地址
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE alert_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id      UUID NOT NULL REFERENCES alert_rules(id),
  project_id   UUID NOT NULL REFERENCES projects(id),
  metric_value NUMERIC NOT NULL,
  threshold    NUMERIC NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  notification_status TEXT NOT NULL DEFAULT 'pending'  -- pending | sent | failed
);

CREATE INDEX idx_alert_rules_project ON alert_rules(project_id) WHERE enabled = true;
CREATE INDEX idx_alert_events_rule ON alert_events(rule_id, triggered_at DESC);
```

### 指标计算 SQL

每种 metric 对应一个窗口聚合 SQL，在 `AlertEvaluator` 中实现：

**error_rate**（窗口内 error observation 占比）：
```sql
SELECT
  count(*) FILTER (WHERE level = 'error') * 100.0 / NULLIF(count(*), 0) AS error_rate
FROM observations o
JOIN traces t ON t.id = o.trace_id
WHERE t.project_id = $1 AND o.start_time >= now() - INTERVAL '$2 seconds'
```

**p99_latency**（窗口内 trace p99 延迟）：
```sql
SELECT percentile_cont(0.99) WITHIN GROUP (
  ORDER BY EXTRACT(EPOCH FROM (max(o.end_time) - t.timestamp)) * 1000
) AS p99
FROM traces t JOIN observations o ON o.trace_id = t.id
WHERE t.project_id = $1 AND t.timestamp >= now() - INTERVAL '$2 seconds'
GROUP BY t.id
```

**cost_rate**（窗口内每分钟成本）：
```sql
SELECT coalesce(sum(total_cost), 0) * 60.0 / $2 AS cost_per_min
FROM observations o JOIN traces t ON t.id = o.trace_id
WHERE t.project_id = $1 AND o.start_time >= now() - INTERVAL '$2 seconds'
```

**trace_rate**（窗口内每分钟 trace 数）：
```sql
SELECT count(*) * 60.0 / $2 AS traces_per_min
FROM traces t
WHERE t.project_id = $1 AND t.timestamp >= now() - INTERVAL '$2 seconds'
```

### 防抖机制

```typescript
// 同一规则在 cooldownSeconds 内不重复触发
private lastTriggered = new Map<string, number>(); // ruleId → timestamp

private shouldTrigger(ruleId: string, cooldownSeconds = 60): boolean {
  const last = this.lastTriggered.get(ruleId);
  if (last && Date.now() - last < cooldownSeconds * 1000) return false;
  this.lastTriggered.set(ruleId, Date.now());
  return true;
}
```

### Webhook 通知

```typescript
// POST 到用户配置的 webhook_url
{
  "event": "alert.triggered",
  "rule": { "id": "...", "name": "Error Rate > 10%", "metric": "error_rate" },
  "project": { "id": "...", "name": "..." },
  "data": { "metricValue": 15.3, "threshold": 10, "windowSeconds": 300 },
  "triggeredAt": "2026-07-12T10:00:00Z"
}
```

### API 端点

```
# 告警规则 CRUD（cookie 鉴权）
GET    /api/alerts/rules?projectId=<uuid>
POST   /api/alerts/rules
GET    /api/alerts/rules/:id
PUT    /api/alerts/rules/:id       # 更新阈值/webhook
DELETE /api/alerts/rules/:id

# 告警事件查询
GET    /api/alerts/events?projectId=<uuid>&limit=50

# 手动测试 webhook
POST   /api/alerts/rules/:id/test
```

### 前端

- `/alerts` 页面：规则列表 + 创建/编辑表单 + 事件历史时间线
- 规则表单：选择 metric（4 种）、operator（gt/lt 等）、threshold、window、webhook URL
- 事件列表：展示触发时间、指标值、阈值、通知状态

---

## 文件清单

### M7 新增文件
```
apps/sdk-python/pyproject.toml
apps/sdk-python/src/oat/__init__.py
apps/sdk-python/src/oat/client.py
apps/sdk-python/src/oat/context.py
apps/sdk-python/src/oat/traceable.py
apps/sdk-python/src/oat/integrations/__init__.py
apps/sdk-python/src/oat/integrations/langchain.py
apps/sdk-python/tests/test_context.py
apps/sdk-python/tests/test_client.py
apps/sdk-python/tests/test_traceable.py
scripts/verify-python-sdk.py
```

### M8 新增/修改文件
```
apps/server/drizzle/0004_alert_tables.sql          # 新增
apps/server/src/db/schema.ts                        # 修改：加 alert_rules / alert_events
apps/server/src/repositories/alert-repository.ts    # 新增
apps/server/src/modules/alert-evaluator.ts           # 新增
apps/server/src/routes/alerts.ts                     # 新增
apps/server/src/app.ts                               # 修改：注册路由 + alert evaluator
apps/server/src/modules/ingestion-service.ts         # 修改：ingestion 后触发评估
apps/web/src/app/alerts/page.tsx                     # 新增：规则列表
apps/web/src/app/alerts/AlertClient.tsx              # 新增：客户端组件
apps/web/src/app/alerts/[id]/page.tsx                # 新增：规则编辑
apps/web/src/lib/api.ts                              # 修改：加 alert API
```
