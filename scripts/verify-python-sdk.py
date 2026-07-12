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
