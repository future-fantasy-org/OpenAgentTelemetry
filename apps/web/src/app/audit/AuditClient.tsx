'use client';

import { useCallback, useEffect, useState } from 'react';
import { listAuditLogs, type AuditLog } from '@/lib/api.client';

export function AuditClient({ projectId }: { projectId?: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [sseConnected, setSseConnected] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAuditLogs({ projectId, action: actionFilter || undefined, limit: 50 });
      setLogs(data.logs);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId, actionFilter]);

  useEffect(() => { reload(); }, [reload]);

  // M12: SSE 实时推送新审计日志
  useEffect(() => {
    const es = new EventSource('/api/stream/audit-logs');
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.addEventListener('audit:logged', (e: MessageEvent) => {
      try {
        const log: AuditLog = JSON.parse(e.data);
        // projectId 过滤（若设置了）
        if (projectId && log.projectId && log.projectId !== projectId) return;
        setLogs((prev) => [log, ...prev].slice(0, 500));
      } catch {}
    });
    return () => { es.close(); };
  }, [projectId]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await listAuditLogs({ projectId, action: actionFilter || undefined, cursor: nextCursor, limit: 50 });
      setLogs((prev) => [...prev, ...data.logs]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">审计日志</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className={`inline-block w-2 h-2 rounded-full ${sseConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
          <span className="text-gray-500">{sseConnected ? '实时连接' : '未连接'}</span>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          placeholder="按 action 筛选（如 auth.login.success）"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm w-80"
        />
        <button onClick={reload} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">刷新</button>
      </div>

      {error && <p className="text-red-600 mb-4">加载失败：{error}</p>}

      {loading ? (
        <p className="text-gray-500">加载中...</p>
      ) : logs.length === 0 ? (
        <p className="text-gray-500">暂无日志</p>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">时间</th>
                <th className="text-left px-3 py-2">Action</th>
                <th className="text-left px-3 py-2">操作者</th>
                <th className="text-left px-3 py-2">方法</th>
                <th className="text-left px-3 py-2">路径</th>
                <th className="text-left px-3 py-2">状态</th>
                <th className="text-left px-3 py-2">耗时</th>
                <th className="text-left px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{log.action}</td>
                  <td className="px-3 py-2">{log.actorEmail ?? '-'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{log.method}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600 max-w-xs truncate" title={log.path}>
                    {log.path}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      log.statusCode < 300 ? 'bg-green-100 text-green-700' :
                      log.statusCode < 400 ? 'bg-blue-100 text-blue-700' :
                      log.statusCode < 500 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {log.statusCode}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{log.durationMs != null ? `${log.durationMs}ms` : '-'}</td>
                  <td className="px-3 py-2 text-gray-500 font-mono text-xs">{log.actorIp ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
