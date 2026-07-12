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
