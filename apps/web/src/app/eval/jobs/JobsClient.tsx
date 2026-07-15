'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listEvalJobs } from '@/lib/api.client';
import type { EvalJob, JobStatus } from '@/lib/api.shared';

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

export function JobsClient({ sp }: { sp: { projectId?: string } }) {
  const projectId = sp.projectId ?? '';
  const [jobs, setJobs] = useState<EvalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listEvalJobs(projectId)
      .then((data) => {
        if (!cancelled) setJobs(data.jobs);
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
  }, [projectId]);

  return (
    <main className="oat-page">
      <div className="oat-page-header">
        <div>
          <h1 className="oat-page-title">评估任务</h1>
          <p className="oat-page-subtitle">批量评估与 A/B 实验管理</p>
        </div>
        <Link
          href={`/eval/jobs/new?projectId=${encodeURIComponent(projectId)}`}
          className="oat-btn oat-btn-primary oat-btn-sm"
        >
          新建评估
        </Link>
      </div>

      {error && <p className="text-red-600 mb-4">加载失败：{error}</p>}

      {loading ? (
        <p className="text-slate-500">加载中...</p>
      ) : jobs.length === 0 ? (
        <div className="oat-card oat-card-pad flex flex-col items-center justify-center text-center text-slate-400">
          <svg
            className="mb-3 h-8 w-8 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p>暂无评估任务，创建一个试试</p>
        </div>
      ) : (
        <div className="oat-card overflow-hidden">
          <table className="oat-table">
            <thead>
              <tr>
                <th className="text-left">名称</th>
                <th className="text-left">状态</th>
                <th className="text-left">进度</th>
                <th className="text-left">模型</th>
                <th className="text-left">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link
                      href={`/eval/jobs/${job.id}?projectId=${encodeURIComponent(projectId)}`}
                      className="oat-link font-medium"
                    >
                      {job.name}
                    </Link>
                  </td>
                  <td>
                    <span
                      className={`oat-badge font-data ${STATUS_BADGE[job.status] ?? 'oat-badge-neutral'}`}
                    >
                      {STATUS_LABELS[job.status] ?? job.status}
                    </span>
                  </td>
                  <td className="text-slate-600">
                    {job.completedItems}/{job.totalItems}
                    {job.failedItems > 0 && (
                      <span className="text-red-600 ml-1">（失败 {job.failedItems}）</span>
                    )}
                  </td>
                  <td className="font-data text-xs">{job.model}</td>
                  <td className="text-slate-500">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
