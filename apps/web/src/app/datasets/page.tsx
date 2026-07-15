import Link from 'next/link';
import { getCurrentProjectId } from '@/lib/project-context';
import { listDatasets } from '@/lib/api.server';

export default async function DatasetsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);
  const datasets = await listDatasets(projectId);

  return (
    <main className="oat-page">
      <header className="oat-page-header">
        <h1 className="oat-page-title">数据集</h1>
        <p className="oat-page-subtitle">管理测试数据集与样例</p>
      </header>

      <div className="oat-card overflow-hidden">
        <table className="oat-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>描述</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {datasets.length === 0 && (
              <tr>
                <td colSpan={3} className="!py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-10 w-10"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                      />
                    </svg>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-600">暂无数据集</p>
                      <p className="text-xs text-slate-400">通过 API 创建一个试试</p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {datasets.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link
                    href={`/datasets/${d.id}?projectId=${projectId}`}
                    className="font-medium text-slate-900 hover:text-indigo-600"
                  >
                    {d.name}
                  </Link>
                </td>
                <td>{d.description ?? '-'}</td>
                <td>{new Date(d.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
