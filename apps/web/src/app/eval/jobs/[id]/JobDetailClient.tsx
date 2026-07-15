'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { cancelEvalJob, getEvalJob, listJobItems } from '@/lib/api.client';
import type { EvalJob, EvalJobItem, JobStatus } from '@/lib/api.shared';

const STATUS_BADGE: Record<JobStatus, string> = {
  pending: 'oat-badge-amber',
  running: 'oat-badge-blue',
  completed: 'oat-badge-green',
  failed: 'oat-badge-red',
  cancelled: 'oat-badge-neutral',
  interrupted: 'oat-badge-neutral',
};

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: '等待中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
};

const ITEM_STATUS_BADGE: Record<string, string> = {
  pending: 'oat-badge-amber',
  running: 'oat-badge-blue',
  success: 'oat-badge-green',
  failed: 'oat-badge-red',
};

export function JobDetailClient({
  jobId,
  sp,
}: {
  jobId: string;
  sp: { projectId?: string };
}) {
  const projectId = sp.projectId ?? '';
  const [job, setJob] = useState<EvalJob | null>(null);
  const [items, setItems] = useState<EvalJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [j, it] = await Promise.all([getEvalJob(jobId), listJobItems(jobId)]);
      setJob(j);
      setItems(it.items);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getEvalJob(jobId), listJobItems(jobId)])
      .then(([j, it]) => {
        if (cancelled) return;
        setJob(j);
        setItems(it.items);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    const es = new EventSource(`/api/stream/eval/${jobId}`);
    es.addEventListener('eval:item-completed', () => {
      reload();
    });
    es.addEventListener('eval:job-completed', () => {
      es.close();
      reload();
    });
    return () => {
      es.close();
    };
  }, [jobId, reload]);

  async function handleCancel() {
    if (!confirm('确定取消此任务？')) return;
    setCancelling(true);
    try {
      await cancelEvalJob(jobId);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  const completedItems = job?.completedItems ?? 0;
  const totalItems = job?.totalItems ?? 0;
  const pct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const isActive = job?.status === 'pending' || job?.status === 'running';

  return (
    <main className="oat-page">
      <div className="mb-6">
        <Link
          href={`/eval/jobs?projectId=${encodeURIComponent(projectId)}`}
          className="oat-link-quiet inline-flex items-center gap-1"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回任务列表
        </Link>
      </div>

      {error && <p className="text-red-600 mb-4">操作失败：{error}</p>}

      {loading ? (
        <p className="text-slate-500">加载中...</p>
      ) : !job ? (
        <p className="text-slate-400">任务不存在</p>
      ) : (
        <>
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="oat-page-title">{job.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                <span
                  className={`oat-badge font-data ${STATUS_BADGE[job.status] ?? 'oat-badge-neutral'}`}
                >
                  {STATUS_LABELS[job.status] ?? job.status}
                </span>
                <span className="font-data">{job.model}</span>
                <span>并发 {job.concurrency}</span>
              </div>
            </div>
            {isActive && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="oat-btn oat-btn-danger oat-btn-sm"
              >
                {cancelling ? '取消中...' : '取消任务'}
              </button>
            )}
          </div>

          {job.errorMessage && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 mb-4">
              {job.errorMessage}
            </p>
          )}

          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>进度</span>
              <span>
                {completedItems}/{totalItems}（{pct}%）
                {job.failedItems > 0 && (
                  <span className="text-red-600 ml-2">失败 {job.failedItems}</span>
                )}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {job.summary && Object.keys(job.summary).length > 0 && (
            <section className="mb-6">
              <h2 className="text-lg font-semibold mb-3">评估摘要</h2>
              <div className="oat-card overflow-hidden">
                <table className="oat-table">
                  <thead>
                    <tr>
                      <th className="text-left">评估器</th>
                      <th className="text-left">平均分</th>
                      <th className="text-left">通过率</th>
                      <th className="text-left">数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(job.summary).map(([name, s]) => (
                      <tr key={name}>
                        <td className="font-medium">{name}</td>
                        <td className="font-data">{s.avg.toFixed(2)}</td>
                        <td className="font-data">{(s.passRate * 100).toFixed(1)}%</td>
                        <td className="text-slate-500">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold mb-3">执行明细（{items.length}）</h2>
            <div className="oat-card overflow-hidden">
              <table className="oat-table">
                <thead>
                  <tr>
                    <th className="text-left">状态</th>
                    <th className="text-left">耗时</th>
                    <th className="text-left">Trace</th>
                    <th className="text-left">错误</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                        暂无执行记录
                      </td>
                    </tr>
                  )}
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <span
                          className={`oat-badge font-data ${ITEM_STATUS_BADGE[it.status] ?? 'oat-badge-neutral'}`}
                        >
                          {it.status}
                        </span>
                      </td>
                      <td className="font-data text-slate-600">
                        {it.latencyMs != null ? `${it.latencyMs}ms` : '-'}
                      </td>
                      <td>
                        {it.traceId ? (
                          <Link
                            href={`/traces/${it.traceId}?projectId=${encodeURIComponent(
                              projectId,
                            )}`}
                            className="oat-link font-data text-xs"
                          >
                            {it.traceId.slice(0, 8)}
                          </Link>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td>
                        {it.errorMessage ? (
                          <span className="text-red-600 text-xs">{it.errorMessage}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
