import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OATClient } from '../src/client.js';

function mockFetch() {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return new Response('{}', { status: 202 });
  });
  return { fetchFn, calls };
}

describe('OATClient 批量上报', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('攒到阈值后批量发送', async () => {
    const { fetchFn, calls } = mockFetch();
    const client = new OATClient({
      baseUrl: 'http://localhost:3001',
      apiKey: 'key',
      flushAt: 2,
      flushInterval: 99999,
      fetch: fetchFn as unknown as typeof fetch,
    });

    client.enqueue({ id: '1', traceId: 't1', parentId: null, type: 'span', name: 'a', startTime: new Date().toISOString() });
    expect(fetchFn).not.toHaveBeenCalled();

    client.enqueue({ id: '2', traceId: 't1', parentId: null, type: 'span', name: 'b', startTime: new Date().toISOString() });
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect((calls[0].body as { batch: unknown[] }).batch).toHaveLength(2);

    await client.shutdown();
  });
});
