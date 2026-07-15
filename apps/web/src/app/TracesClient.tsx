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
    <main className="oat-page">
      <div className="oat-page-header">
        <div>
          <h1 className="oat-page-title">Traces</h1>
          <p className="oat-page-subtitle">实时追踪每一次 Agent 调用的完整链路</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs">
          <span className={`oat-dot ${sseConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          <span className={sseConnected ? 'text-emerald-700' : 'text-slate-500'}>
            {sseConnected ? '实时连接' : '未连接'}
          </span>
        </div>
      </div>

      <div className="oat-card overflow-hidden">
        <table className="oat-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>用户</th>
              <th>会话</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {traces.length === 0 && (
              <tr>
                <td colSpan={4} className="!py-16 text-center">
                  <div className="mx-auto flex max-w-xs flex-col items-center gap-2 text-slate-400">
                    <svg className="h-10 w-10 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12h4l2-7 4 14 2-7h6" />
                    </svg>
                    <div className="text-sm">暂无 trace</div>
                    <div className="text-xs text-slate-400">用 SDK 上报一条试试</div>
                  </div>
                </td>
              </tr>
            )}
            {traces.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link
                    href={`/traces/${t.id}?projectId=${projectId}`}
                    className="font-medium text-slate-900 hover:text-indigo-600"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="font-data text-xs text-slate-500">{t.userId ?? '-'}</td>
                <td className="font-data text-xs text-slate-500">{t.sessionId ?? '-'}</td>
                <td className="text-slate-500">{new Date(t.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="mt-5 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="oat-btn oat-btn-ghost"
          >
            {loadingMore ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
    </main>
  );
}
