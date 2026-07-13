'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listEvalJobs } from '@/lib/api.client';
import type { EvalJob, JobStatus } from '@/lib/api.shared';

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
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">评估任务</h1>
        <Link
          href={`/eval/jobs/new?projectId=${encodeURIComponent(projectId)}`}
          className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          新建评估
        </Link>
      </div>

      {error && <p className="text-red-600 mb-4">加载失败：{error}</p>}

      {loading ? (
        <p className="text-gray-500">加载中...</p>
      ) : jobs.length === 0 ? (
        <p className="text-gray-400 py-4">暂无评估任务，创建一个试试</p>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">名称</th>
                <th className="text-left px-4 py-2">状态</th>
                <th className="text-left px-4 py-2">进度</th>
                <th className="text-left px-4 py-2">模型</th>
                <th className="text-left px-4 py-2">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/eval/jobs/${job.id}?projectId=${encodeURIComponent(projectId)}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {job.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs font-mono px-2 py-0.5 rounded ${
                        STATUS_COLORS[job.status] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {STATUS_LABELS[job.status] ?? job.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {job.completedItems}/{job.totalItems}
                    {job.failedItems > 0 && (
                      <span className="text-red-600 ml-1">（失败 {job.failedItems}）</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600 font-mono">{job.model}</td>
                  <td className="px-4 py-2 text-gray-500">
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
