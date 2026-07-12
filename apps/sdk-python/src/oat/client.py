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
