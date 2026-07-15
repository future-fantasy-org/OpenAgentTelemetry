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
    <main className="oat-page-wide">
      <div className="oat-page-header mb-6">
        <div>
          <h1 className="oat-page-title">审计日志</h1>
          <p className="oat-page-subtitle">实时追踪系统中的关键操作与请求记录</p>
        </div>
        <div className="oat-btn oat-btn-ghost oat-btn-sm gap-2">
          <span className={`oat-dot ${sseConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          <span className="text-slate-500">{sseConnected ? '实时连接' : '未连接'}</span>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          placeholder="按 action 筛选（如 auth.login.success）"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="oat-input w-80"
        />
        <button onClick={reload} className="oat-btn oat-btn-ghost oat-btn-sm">刷新</button>
      </div>

      {error && <p className="text-red-600 mb-4">加载失败：{error}</p>}

      {loading ? (
        <p className="oat-link-quiet">加载中...</p>
      ) : logs.length === 0 ? (
        <p className="oat-link-quiet">暂无日志</p>
      ) : (
        <div className="oat-card overflow-hidden">
          <table className="oat-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>Action</th>
                <th>操作者</th>
                <th>方法</th>
                <th>路径</th>
                <th>状态</th>
                <th>耗时</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap text-slate-500">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="font-data text-xs">{log.action}</td>
                  <td>{log.actorEmail ?? '-'}</td>
                  <td className="font-data text-xs">{log.method}</td>
                  <td className="font-data text-xs text-slate-600 max-w-xs truncate" title={log.path}>
                    {log.path}
                  </td>
                  <td>
                    <span className={`oat-badge ${
                      log.statusCode < 300 ? 'oat-badge-green' :
                      log.statusCode < 400 ? 'oat-badge-blue' :
                      log.statusCode < 500 ? 'oat-badge-amber' :
                      'oat-badge-red'
                    }`}>
                      {log.statusCode}
                    </span>
                  </td>
                  <td className="text-slate-500">{log.durationMs != null ? `${log.durationMs}ms` : '-'}</td>
                  <td className="font-data text-xs text-slate-500">{log.actorIp ?? '-'}</td>
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
            className="oat-btn oat-btn-ghost disabled:opacity-50"
          >
            {loadingMore ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
    </main>
  );
}
