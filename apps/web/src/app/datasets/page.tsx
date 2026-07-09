import Link from 'next/link';
import { listDatasets } from '@/lib/api';

const SEED_PROJECT_ID = process.env.SEED_PROJECT_ID ?? '';

export default async function DatasetsPage() {
  let datasets: Awaited<ReturnType<typeof listDatasets>> = [];
  let error: string | null = null;
  try {
    if (SEED_PROJECT_ID) datasets = await listDatasets(SEED_PROJECT_ID);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">数据集</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="text-blue-600 hover:underline">Traces</Link>
          <Link href="/prompts" className="text-blue-600 hover:underline">Prompt 管理</Link>
        </nav>
      </div>
      {error && <p className="text-red-600 mb-4">加载失败：{error}</p>}
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
            {datasets.length === 0 && !error && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  暂无数据集，通过 API 创建一个试试
                </td>
              </tr>
            )}
            {datasets.map((d) => (
              <tr key={d.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/datasets/${d.id}`} className="font-medium text-blue-600 hover:underline">
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
