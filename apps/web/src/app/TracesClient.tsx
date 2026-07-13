'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listTracesClient, type TraceListItem } from '@/lib/api.client';

export function TracesClient({
  initialTraces,
  projectId,
}: {
  initialTraces: TraceListItem[];
  projectId: string;
}) {
  const [traces, setTraces] = useState<TraceListItem[]>(initialTraces);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);

  // M12: SSE 实时推送新 trace
  useEffect(() => {
    const es = new EventSource(`/api/stream/traces?projectId=${encodeURIComponent(projectId)}`);
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.addEventListener('trace:created', (e: MessageEvent) => {
      try {
        const trace: TraceListItem = JSON.parse(e.data);
        trace.timestamp = typeof trace.timestamp === 'string' ? trace.timestamp : new Date(trace.timestamp).toISOString();
        setTraces((prev) => {
          if (prev.some((t) => t.id === trace.id)) return prev;
          return [trace, ...prev];
        });
      } catch {}
    });
    return () => { es.close(); };
  }, [projectId]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await listTracesClient({ projectId, cursor: nextCursor, limit: 50 });
      setTraces((prev) => [...prev, ...data.traces]);
      setNextCursor(data.nextCursor);
    } catch {} finally {
      setLoadingMore(false);
    }
  }

  // 首次挂载后探测是否有下一页（初始 SSR 只取了 50 条但没返回 nextCursor）
  useEffect(() => {
    if (initialTraces.length === 50) {
      listTracesClient({ projectId, limit: 50 }).then((data) => {
        setNextCursor(data.nextCursor);
      }).catch(() => {});
    }
  }, [initialTraces.length, projectId]);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Traces</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className={`inline-block w-2 h-2 rounded-full ${sseConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
          <span className="text-gray-500">{sseConnected ? '实时连接' : '未连接'}</span>
        </div>
      </div>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">名称</th>
              <th className="text-left px-4 py-2">用户</th>
              <th className="text-left px-4 py-2">会话</th>
              <th className="text-left px-4 py-2">时间</th>
            </tr>
          </thead>
          <tbody>
            {traces.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  暂无 trace，用 SDK 上报一条试试
                </td>
              </tr>
            )}
            {traces.map((t) => (
              <tr key={t.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/traces/${t.id}?projectId=${projectId}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{t.userId ?? '-'}</td>
                <td className="px-4 py-2 text-gray-500">{t.sessionId ?? '-'}</td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(t.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingMore ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
    </main>
  );
}
