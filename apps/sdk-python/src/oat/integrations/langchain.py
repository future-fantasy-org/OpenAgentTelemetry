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
