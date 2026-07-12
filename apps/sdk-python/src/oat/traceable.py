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
