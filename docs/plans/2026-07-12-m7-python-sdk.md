# M7: Python SDK Implementation Plan

**Goal:** 创建 Python SDK，核心追踪功能 + LangChain 集成，与 TS SDK 功能对齐。

**Architecture:** contextvars 管理父子关系，后台线程批量 flush，urllib 标准 库零依赖。LangChain 集成作为可选 extra。

**Tech Stack:** Python ≥ 3.9, contextvars, threading, urllib, pytest

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/sdk-python/pyproject.toml` | 包配置，入口点，可选依赖 |
| `apps/sdk-python/src/oat/__init__.py` | 公开 API 导出 |
| `apps/sdk-python/src/oat/context.py` | contextvars 上下文管理 |
| `apps/sdk-python/src/oat/client.py` | OATClient 批量缓冲 + 后台 flush |
| `apps/sdk-python/src/oat/traceable.py` | @traceable 装饰器 |
| `apps/sdk-python/src/oat/integrations/langchain.py` | LangChain CallbackHandler |
| `apps/sdk-python/tests/test_context.py` | 上下文传播测试 |
| `apps/sdk-python/tests/test_client.py` | 批量客户端测试 |
| `apps/sdk-python/tests/test_traceable.py` | 装饰器 + 父子树测试 |
| `scripts/verify-python-sdk.py` | 端到端验证脚本 |

---

### Task 1: 项目脚手架 + pyproject.toml

**Files:**
- Create: `apps/sdk-python/pyproject.toml`
- Create: `apps/sdk-python/src/oat/__init__.py`

- [ ] **Step 1: 创建 pyproject.toml**

```toml
[build-system]
requires = ["setuptools>=68.0", "wheel"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "oat-python"
version = "0.1.0"
description = "OpenAgentTelemetry Python SDK — trace LLM/Agent calls"
requires-python = ">=3.9"
license = { text = "MIT" }
dependencies = []

[project.optional-dependencies]
langchain = ["langchain-core>=0.1.0"]
dev = ["pytest>=7.0", "pytest-asyncio>=0.21"]

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 2: 创建 __init__.py 占位**

```python
"""OpenAgentTelemetry Python SDK."""
__version__ = "0.1.0"
```

- [ ] **Step 3: 验证安装**

Run: `cd apps/sdk-python && pip install -e ".[dev]" && python -c "import oat; print(oat.__version__)"`
Expected: `0.1.0`

- [ ] **Step 4: Commit**

```bash
git add apps/sdk-python/
git commit -m "feat(M7): Python SDK scaffold + pyproject.toml"
```

---

### Task 2: contextvars 上下文管理

**Files:**
- Create: `apps/sdk-python/src/oat/context.py`
- Create: `apps/sdk-python/tests/test_context.py`

- [ ] **Step 1: 写失败测试**

```python
import asyncio
from oat.context import (
    get_current_parent_id,
    get_or_init_trace_id,
    reset_trace_id,
    set_observation_context,
)


def test_trace_id_init():
    reset_trace_id()
    tid = get_or_init_trace_id()
    assert tid is not None
    assert get_or_init_trace_id() == tid  # 同一上下文复用


def test_reset_trace_id_generates_new():
    reset_trace_id()
    tid1 = get_or_init_trace_id()
    reset_trace_id()
    tid2 = get_or_init_trace_id()
    assert tid1 != tid2


def test_observation_context_sets_parent():
    reset_trace_id()
    assert get_current_parent_id() is None
    with set_observation_context("obs-1"):
        assert get_current_parent_id() == "obs-1"
    assert get_current_parent_id() is None  # 退出后恢复


def test_nested_observation_context():
    reset_trace_id()
    with set_observation_context("outer"):
        assert get_current_parent_id() == "outer"
        with set_observation_context("inner"):
            assert get_current_parent_id() == "inner"
        assert get_current_parent_id() == "outer"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/sdk-python && pytest tests/test_context.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 实现 context.py**

```python
import contextvars
import uuid
from contextlib import contextmanager
from typing import Optional

_current_observation_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "_oat_observation_id", default=None
)
_current_trace_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "_oat_trace_id", default=None
)


def get_current_parent_id() -> Optional[str]:
    return _current_observation_id.get()


def get_or_init_trace_id() -> str:
    tid = _current_trace_id.get()
    if tid is None:
        tid = str(uuid.uuid4())
        _current_trace_id.set(tid)
    return tid


def reset_trace_id(trace_id: Optional[str] = None) -> None:
    _current_trace_id.set(trace_id or str(uuid.uuid4()))


@contextmanager
def set_observation_context(observation_id: str):
    token = _current_observation_id.set(observation_id)
    try:
        yield
    finally:
        _current_observation_id.reset(token)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/sdk-python && pytest tests/test_context.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add apps/sdk-python/src/oat/context.py apps/sdk-python/tests/test_context.py
git commit -m "feat(M7): contextvars context management"
```

---

### Task 3: OATClient 批量客户端

**Files:**
- Create: `apps/sdk-python/src/oat/client.py`
- Create: `apps/sdk-python/tests/test_client.py`

- [ ] **Step 1: 写失败测试**

```python
import time
from unittest.mock import patch, MagicMock
from oat.client import OATClient


def test_enqueue_buffers_until_flush_at():
    client = OATClient("http://localhost:3001", "test-key", flush_at=3, flush_interval=999)
    with patch.object(client, "_send_batch") as mock_send:
        client.enqueue({"id": "1", "name": "a"})
        client.enqueue({"id": "2", "name": "b"})
        assert mock_send.call_count == 0
        client.enqueue({"id": "3", "name": "c"})
        assert mock_send.call_count == 1


def test_flush_interval_triggers_flush():
    client = OATClient("http://localhost:3001", "test-key", flush_at=100, flush_interval=0.1)
    with patch.object(client, "_send_batch") as mock_send:
        client.enqueue({"id": "1", "name": "a"})
        time.sleep(0.3)
        assert mock_send.call_count >= 1
    client.shutdown()


def test_shutdown_flushes_remaining():
    client = OATClient("http://localhost:3001", "test-key", flush_at=100, flush_interval=999)
    with patch.object(client, "_send_batch") as mock_send:
        client.enqueue({"id": "1", "name": "a"})
        client.shutdown()
        assert mock_send.call_count == 1


def test_send_batch_sends_correct_payload():
    client = OATClient("http://localhost:3001", "test-key", flush_at=100, flush_interval=999)
    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client.enqueue({"id": "1", "traceId": "t1", "name": "test", "type": "span",
                        "startTime": "2026-01-01T00:00:00Z", "endTime": "2026-01-01T00:00:01Z"})
        client._do_flush()

        assert mock_urlopen.call_count == 1
        req = mock_urlopen.call_args[0][0]
        assert req.headers["Authorization"] == "Bearer test-key"
    client.shutdown()
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/sdk-python && pytest tests/test_client.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 实现 client.py**

```python
import json
import logging
import threading
import urllib.request
from typing import Any, Optional

logger = logging.getLogger("oat")


class OATClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        flush_at: int = 50,
        flush_interval: float = 1.0,
    ):
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._flush_at = flush_at
        self._flush_interval = flush_interval
        self._batch: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._flush_thread.start()

    def enqueue(self, observation: dict[str, Any]) -> None:
        with self._lock:
            self._batch.append(observation)
            if len(self._batch) >= self._flush_at:
                self._do_flush_unlocked()

    def _flush_loop(self) -> None:
        while not self._stop_event.wait(self._flush_interval):
            self._do_flush()

    def _do_flush(self) -> None:
        with self._lock:
            self._do_flush_unlocked()

    def _do_flush_unlocked(self) -> None:
        if not self._batch:
            return
        batch = self._batch[:]
        self._batch.clear()
        try:
            self._send_batch(batch)
        except Exception as e:
            logger.warning("OAT flush failed: %s", e)
            self._batch = batch + self._batch

    def _send_batch(self, batch: list[dict[str, Any]]) -> None:
        url = f"{self._base_url}/api/public/ingestion"
        data = json.dumps({"batch": batch}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._api_key}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status not in (200, 202):
                raise RuntimeError(f"Server returned {resp.status}")

    def shutdown(self) -> None:
        self._stop_event.set()
        self._flush_thread.join(timeout=5)
        self._do_flush()
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/sdk-python && pytest tests/test_client.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add apps/sdk-python/src/oat/client.py apps/sdk-python/tests/test_client.py
git commit -m "feat(M7): OATClient batch buffering + background flush"
```

---

### Task 4: @traceable 装饰器

**Files:**
- Create: `apps/sdk-python/src/oat/traceable.py`
- Create: `apps/sdk-python/tests/test_traceable.py`
- Modify: `apps/sdk-python/src/oat/__init__.py`

- [ ] **Step 1: 写失败测试**

```python
import asyncio
from unittest.mock import patch, MagicMock
from oat.traceable import traceable
from oat.context import reset_trace_id, get_current_parent_id
from oat.client import OATClient


def test_traceable_sync():
    client = OATClient("http://localhost:3001", "key", flush_at=100, flush_interval=999)

    @traceable
    def greet(name: str) -> str:
        return f"Hello, {name}!"

    with patch.object(client, "enqueue") as mock_enqueue:
        from oat import traceable as _t
        _t._default_client = client
        reset_trace_id()
        result = greet("World")
        assert result == "Hello, World!"
        assert mock_enqueue.call_count == 1
        obs = mock_enqueue.call_args[0][0]
        assert obs["name"] == "greet"
        assert obs["type"] == "span"
    client.shutdown()


def test_traceable_async():
    client = OATClient("http://localhost:3001", "key", flush_at=100, flush_interval=999)

    @traceable
    async def agreet(name: str) -> str:
        await asyncio.sleep(0.01)
        return f"Hi, {name}!"

    with patch.object(client, "enqueue") as mock_enqueue:
        from oat import traceable as _t
        _t._default_client = client
        reset_trace_id()
        result = asyncio.run(agreet("World"))
        assert result == "Hi, World!"
        assert mock_enqueue.call_count == 1
    client.shutdown()


def test_traceable_nested_parent_child():
    client = OATClient("http://localhost:3001", "key", flush_at=100, flush_interval=999)

    @traceable
    def child():
        return "child-result"

    @traceable
    def parent():
        return child()

    with patch.object(client, "enqueue") as mock_enqueue:
        from oat import traceable as _t
        _t._default_client = client
        reset_trace_id()
        parent()
        assert mock_enqueue.call_count == 2
        parent_obs = mock_enqueue.call_args_list[0][0][0]
        child_obs = mock_enqueue.call_args_list[1][0][0]
        assert child_obs["parentId"] is not None
        assert parent_obs["parentId"] is None
    client.shutdown()


def test_traceable_custom_name():
    client = OATClient("http://localhost:3001", "key", flush_at=100, flush_interval=999)

    @traceable(name="custom-name")
    def fn():
        return "ok"

    with patch.object(client, "enqueue") as mock_enqueue:
        from oat import traceable as _t
        _t._default_client = client
        reset_trace_id()
        fn()
        obs = mock_enqueue.call_args[0][0]
        assert obs["name"] == "custom-name"
    client.shutdown()


def test_traceable_extracts_llm_meta():
    client = OATClient("http://localhost:3001", "key", flush_at=100, flush_interval=999)

    @traceable
    def llm_call(prompt):
        return {"output": "resp", "model": "gpt-4o", "promptTokens": 120, "completionTokens": 80, "totalCost": 0.005}

    with patch.object(client, "enqueue") as mock_enqueue:
        from oat import traceable as _t
        _t._default_client = client
        reset_trace_id()
        llm_call("hi")
        obs = mock_enqueue.call_args[0][0]
        assert obs["model"] == "gpt-4o"
        assert obs["promptTokens"] == 120
        assert obs["completionTokens"] == 80
        assert obs["totalCost"] == 0.005
        assert "model" not in obs["output"]
    client.shutdown()
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/sdk-python && pytest tests/test_traceable.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 实现 traceable.py**

```python
import asyncio
import functools
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional, TypeVar

from oat.client import OATClient
from oat.context import get_current_parent_id, get_or_init_trace_id, set_observation_context

_default_client: Optional[OATClient] = None

F = TypeVar("F", bound=Callable[..., Any])


def set_default_client(client: OATClient) -> None:
    global _default_client
    _default_client = client


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _extract_llm_meta(result: Any) -> dict[str, Any]:
    if not isinstance(result, dict):
        return {"rest": result}
    meta: dict[str, Any] = {}
    if isinstance(result.get("model"), str):
        meta["model"] = result["model"]
    if isinstance(result.get("promptTokens"), (int, float)):
        meta["promptTokens"] = result["promptTokens"]
    if isinstance(result.get("completionTokens"), (int, float)):
        meta["completionTokens"] = result["completionTokens"]
    if isinstance(result.get("totalCost"), (int, float)):
        meta["totalCost"] = result["totalCost"]
    rest = {k: v for k, v in result.items() if k not in ("model", "promptTokens", "completionTokens", "totalCost")}
    return {**meta, "rest": rest}


async def _run_traceable(func, args, kwargs, obs_name):
    obs_id = str(uuid.uuid4())
    start = _now_iso()
    try:
        result = await func(*args, **kwargs)
        end = _now_iso()
        if _default_client is not None:
            meta = _extract_llm_meta(result)
            observation = {
                "id": obs_id,
                "traceId": get_or_init_trace_id(),
                "parentId": get_current_parent_id(),
                "type": "span",
                "name": obs_name,
                "startTime": start,
                "endTime": end,
                "input": list(args) if args else None,
                "output": meta.get("rest"),
            }
            for key in ("model", "promptTokens", "completionTokens", "totalCost"):
                if key in meta:
                    observation[key] = meta[key]
            _default_client.enqueue(observation)
        return result
    except Exception as e:
        end = _now_iso()
        if _default_client is not None:
            observation = {
                "id": obs_id,
                "traceId": get_or_init_trace_id(),
                "parentId": get_current_parent_id(),
                "type": "span",
                "name": obs_name,
                "startTime": start,
                "endTime": end,
                "input": list(args) if args else None,
                "output": None,
                "level": "error",
                "metadata": {"error": str(e), "errorType": type(e).__name__},
            }
            _default_client.enqueue(observation)
        raise


def traceable(fn: Optional[F] = None, *, name: Optional[str] = None) -> Any:
    def decorator(func: F) -> F:
        obs_name = name or getattr(func, "__name__", "unknown")

        if asyncio.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                obs_id = str(uuid.uuid4())
                with set_observation_context(obs_id):
                    return await _run_traceable(func, args, kwargs, obs_name)
            return async_wrapper  # type: ignore
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                obs_id = str(uuid.uuid4())
                with set_observation_context(obs_id):
                    async def _inner():
                        return await _run_traceable(func, args, kwargs, obs_name)
                    return asyncio.run(_inner())
            return sync_wrapper  # type: ignore

    if fn is not None:
        return decorator(fn)
    return decorator
```

- [ ] **Step 4: 更新 __init__.py**

```python
"""OpenAgentTelemetry Python SDK."""
from oat.client import OATClient
from oat.context import reset_trace_id, get_current_parent_id
from oat.traceable import traceable, set_default_client

__version__ = "0.1.0"
__all__ = ["OATClient", "traceable", "set_default_client", "reset_trace_id", "get_current_parent_id"]
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd apps/sdk-python && pytest tests/ -v`
Expected: all passed

- [ ] **Step 6: Commit**

```bash
git add apps/sdk-python/src/oat/traceable.py apps/sdk-python/src/oat/__init__.py apps/sdk-python/tests/test_traceable.py
git commit -m "feat(M7): @traceable decorator (sync + async + LLM meta extraction)"
```

---

### Task 5: LangChain CallbackHandler 集成

**Files:**
- Create: `apps/sdk-python/src/oat/integrations/__init__.py`
- Create: `apps/sdk-python/src/oat/integrations/langchain.py`

- [ ] **Step 1: 创建 integrations 包**

```python
# apps/sdk-python/src/oat/integrations/__init__.py
"""OAT third-party integrations."""
```

- [ ] **Step 2: 实现 LangChain CallbackHandler**

```python
# apps/sdk-python/src/oat/integrations/langchain.py
"""LangChain integration — map LangChain callbacks to OAT observations."""
import time
import uuid
from typing import Any, Dict, Optional, Sequence
from datetime import datetime, timezone

from oat.client import OATClient
from oat.context import get_current_parent_id, get_or_init_trace_id, set_observation_context

try:
    from langchain_core.callbacks import BaseCallbackHandler
except ImportError:
    raise ImportError(
        "langchain-core is required for OAT LangChain integration. "
        "Install with: pip install oat-python[langchain]"
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class OATLangChainHandler(BaseCallbackHandler):
    """LangChain callback handler that records traces to OAT platform."""

    def __init__(self, client: OATClient, trace_name: str = "langchain-run"):
        self._client = client
        self._trace_name = trace_name
        self._observations: Dict[str, dict[str, Any]] = {}

    @property
    def name(self) -> str:
        return "OATLangChainHandler"

    def _make_observation(
        self,
        run_id: uuid.UUID,
        parent_run_id: Optional[uuid.UUID],
        obs_type: str,
        name: str,
        inputs: Any = None,
    ) -> dict[str, Any]:
        obs_id = str(run_id)
        parent_id = str(parent_run_id) if parent_run_id else get_current_parent_id()
        return {
            "id": obs_id,
            "traceId": get_or_init_trace_id(),
            "parentId": parent_id,
            "type": obs_type,
            "name": name,
            "startTime": _now_iso(),
            "input": inputs,
        }

    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: Sequence[str],
        run_id: uuid.UUID,
        parent_run_id: Optional[uuid.UUID] = None,
        **kwargs: Any,
    ) -> None:
        model_name = serialized.get("name", "unknown-llm")
        obs = self._make_observation(run_id, parent_run_id, "generation", model_name, {"prompts": list(prompts)})
        self._observations[str(run_id)] = obs
        self._client.enqueue(obs)

    def on_llm_end(self, response, run_id: uuid.UUID, parent_run_id: Optional[uuid.UUID] = None, **kwargs: Any) -> None:
        obs = self._observations.get(str(run_id))
        if obs is None:
            return
        obs["endTime"] = _now_iso()
        output_text = ""
        if hasattr(response, "generations") and response.generations:
            first = response.generations[0]
            if first:
                output_text = getattr(first[0], "text", str(first[0]))
        obs["output"] = {"content": output_text}
        llm_output = getattr(response, "llm_output", None) or {}
        token_usage = llm_output.get("token_usage", {})
        if token_usage:
            obs["promptTokens"] = token_usage.get("prompt_tokens")
            obs["completionTokens"] = token_usage.get("completion_tokens")
        model_name = llm_output.get("model_name")
        if model_name:
            obs["model"] = model_name
        self._client.enqueue(obs)

    def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        run_id: uuid.UUID,
        parent_run_id: Optional[uuid.UUID] = None,
        **kwargs: Any,
    ) -> None:
        chain_name = serialized.get("name", "chain")
        obs = self._make_observation(run_id, parent_run_id, "span", chain_name, inputs)
        self._observations[str(run_id)] = obs
        self._client.enqueue(obs)

    def on_chain_end(self, outputs: Dict[str, Any], run_id: uuid.UUID, **kwargs: Any) -> None:
        obs = self._observations.get(str(run_id))
        if obs is None:
            return
        obs["endTime"] = _now_iso()
        obs["output"] = outputs
        self._client.enqueue(obs)

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        run_id: uuid.UUID,
        parent_run_id: Optional[uuid.UUID] = None,
        **kwargs: Any,
    ) -> None:
        tool_name = serialized.get("name", "tool")
        obs = self._make_observation(run_id, parent_run_id, "span", tool_name, {"input": input_str})
        self._observations[str(run_id)] = obs
        self._client.enqueue(obs)

    def on_tool_end(self, output: str, run_id: uuid.UUID, **kwargs: Any) -> None:
        obs = self._observations.get(str(run_id))
        if obs is None:
            return
        obs["endTime"] = _now_iso()
        obs["output"] = {"result": output}
        self._client.enqueue(obs)

    def on_llm_error(self, error, run_id: uuid.UUID, **kwargs: Any) -> None:
        self._set_error(run_id, error)

    def on_chain_error(self, error, run_id: uuid.UUID, **kwargs: Any) -> None:
        self._set_error(run_id, error)

    def on_tool_error(self, error, run_id: uuid.UUID, **kwargs: Any) -> None:
        self._set_error(run_id, error)

    def _set_error(self, run_id: uuid.UUID, error: BaseException) -> None:
        obs = self._observations.get(str(run_id))
        if obs is None:
            return
        obs["endTime"] = _now_iso()
        obs["level"] = "error"
        obs["metadata"] = {"error": str(error), "errorType": type(error).__name__}
        self._client.enqueue(obs)
```

- [ ] **Step 3: 验证导入**

Run: `cd apps/sdk-python && pip install -e ".[langchain,dev]" && python -c "from oat.integrations.langchain import OATLangChainHandler; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add apps/sdk-python/src/oat/integrations/
git commit -m "feat(M7): LangChain BaseCallbackHandler integration"
```

---

### Task 6: 端到端验证脚本 + __init__ 完善

**Files:**
- Create: `scripts/verify-python-sdk.py`
- Modify: `apps/sdk-python/src/oat/__init__.py` — 添加 integrations 快捷导入

- [ ] **Step 1: 写验证脚本**

```python
#!/usr/bin/env python3
"""端到端验证 Python SDK：灌入 5 条 trace，每条 2 个 observation。"""
import sys
import asyncio
import uuid

sys.path.insert(0, "apps/sdk-python/src")

from oat import OATClient, traceable, set_default_client, reset_trace_id

client = OATClient(
    base_url="http://localhost:3001",
    api_key="demo-api-key",
    flush_at=100,
    flush_interval=2.0,
)
set_default_client(client)


@traceable
def search(query: str) -> dict:
    return {"results": [f"doc-{query}"], "model": "gpt-4o-mini", "promptTokens": 50, "completionTokens": 20, "totalCost": 0.001}


@traceable
async def agent_run(query: str) -> dict:
    search_result = search(query)
    return {"answer": f"Based on {search_result['results']}", "model": "gpt-4o", "promptTokens": 100, "completionTokens": 60, "totalCost": 0.004}


async def main():
    for i in range(5):
        reset_trace_id(str(uuid.uuid4()))
        await agent_run(f"query-{i}")
    client.shutdown()
    print("Done: 5 traces × 2 observations = 10 observations sent")


asyncio.run(main())
```

- [ ] **Step 2: 运行验证**

Run: `python scripts/verify-python-sdk.py`
Expected: `Done: 5 traces × 2 observations = 10 observations sent`

然后验证 DB:
```bash
psql oat -c "SELECT count(*) FROM traces WHERE timestamp > now() - INTERVAL '1 minute';"
```
Expected: ≥ 5

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-python-sdk.py
git commit -m "feat(M7): Python SDK e2e verification script"
```

---

### Task 7: 更新根 README + CHANGELOG

**Files:**
- Modify: `README.md` — 项目结构新增 sdk-python，SDK 使用新增 Python 示例
- Modify: `README.zh-CN.md` — 同步更新中文版
- Modify: `CHANGELOG.md` — 新增 M7 条目

- [ ] **Step 1: 更新 README.md 项目结构**

在 `apps/sdk-ts/` 后添加：
```
│   └── sdk-python/          # Python SDK
│       ├── src/oat/
│       │   ├── client.py    # 批量缓冲 HTTP 客户端
│       │   ├── context.py   # contextvars 上下文管理
│       │   ├── traceable.py # 函数装饰器
│       │   └── integrations/langchain.py  # LangChain 集成
│       └── pyproject.toml
```

- [ ] **Step 2: 更新 CHANGELOG.md**

在 M6 之前添加 M7 条目，记录所有新增文件。

- [ ] **Step 3: Commit + Push**

```bash
git add README.md README.zh-CN.md CHANGELOG.md docs/
git commit -m "docs: update README + CHANGELOG for M7 Python SDK"
git push
```
