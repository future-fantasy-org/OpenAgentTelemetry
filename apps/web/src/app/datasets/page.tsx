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
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold mb-6">数据集</h1>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">名称</th>
              <th className="text-left px-4 py-2">描述</th>
              <th className="text-left px-4 py-2">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {datasets.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  暂无数据集，通过 API 创建一个试试
                </td>
              </tr>
            )}
            {datasets.map((d) => (
              <tr key={d.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/datasets/${d.id}?projectId=${projectId}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {d.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{d.description ?? '-'}</td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(d.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
