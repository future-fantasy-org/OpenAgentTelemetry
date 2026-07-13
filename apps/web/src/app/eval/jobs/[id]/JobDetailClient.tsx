'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { cancelEvalJob, getEvalJob, listJobItems } from '@/lib/api.client';
import type { EvalJob, EvalJobItem, JobStatus } from '@/lib/api.shared';

const STATUS_COLORS: Record<JobStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  interrupted: 'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: '等待中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
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
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-6">
        <Link
          href={`/eval/jobs?projectId=${encodeURIComponent(projectId)}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 返回任务列表
        </Link>
      </div>

      {error && <p className="text-red-600 mb-4">操作失败：{error}</p>}

      {loading ? (
        <p className="text-gray-500">加载中...</p>
      ) : !job ? (
        <p className="text-gray-400">任务不存在</p>
      ) : (
        <>
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">{job.name}</h1>
              <div className="mt-2 flex gap-4 text-sm text-gray-500">
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded ${
                    STATUS_COLORS[job.status] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {STATUS_LABELS[job.status] ?? job.status}
                </span>
                <span className="font-mono">{job.model}</span>
                <span>并发 {job.concurrency}</span>
              </div>
            </div>
            {isActive && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? '取消中...' : '取消任务'}
              </button>
            )}
          </div>

          {job.errorMessage && (
            <p className="text-red-600 mb-4 bg-red-50 border border-red-200 rounded px-3 py-2 text-sm">
              {job.errorMessage}
            </p>
          )}

          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>进度</span>
              <span>
                {completedItems}/{totalItems}（{pct}%）
                {job.failedItems > 0 && (
                  <span className="text-red-600 ml-2">失败 {job.failedItems}</span>
                )}
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {job.summary && Object.keys(job.summary).length > 0 && (
            <section className="mb-6">
              <h2 className="text-lg font-semibold mb-3">评估摘要</h2>
              <div className="rounded-lg border bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2">评估器</th>
                      <th className="text-left px-4 py-2">平均分</th>
                      <th className="text-left px-4 py-2">通过率</th>
                      <th className="text-left px-4 py-2">数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(job.summary).map(([name, s]) => (
                      <tr key={name} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{name}</td>
                        <td className="px-4 py-2 font-mono">{s.avg.toFixed(2)}</td>
                        <td className="px-4 py-2 font-mono">
                          {(s.passRate * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-2 text-gray-500">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold mb-3">执行明细（{items.length}）</h2>
            <div className="rounded-lg border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-2">状态</th>
                    <th className="text-left px-4 py-2">耗时</th>
                    <th className="text-left px-4 py-2">Trace</th>
                    <th className="text-left px-4 py-2">错误</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                        暂无执行记录
                      </td>
                    </tr>
                  )}
                  {items.map((it) => (
                    <tr key={it.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs font-mono px-2 py-0.5 rounded ${
                            ITEM_STATUS_COLORS[it.status] ?? 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {it.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-gray-600">
                        {it.latencyMs != null ? `${it.latencyMs}ms` : '-'}
                      </td>
                      <td className="px-4 py-2">
                        {it.traceId ? (
                          <Link
                            href={`/traces/${it.traceId}?projectId=${encodeURIComponent(
                              projectId,
                            )}`}
                            className="text-blue-600 hover:underline font-mono text-xs"
                          >
                            {it.traceId.slice(0, 8)}
                          </Link>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {it.errorMessage ? (
                          <span className="text-red-600 text-xs">{it.errorMessage}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
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
