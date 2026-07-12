import Link from 'next/link';
import { listPrompts } from '@/lib/api';

const SEED_PROJECT_ID = process.env.SEED_PROJECT_ID ?? '';

export default async function PromptsPage() {
  let prompts: Awaited<ReturnType<typeof listPrompts>> = [];
  let error: string | null = null;
  try {
    if (SEED_PROJECT_ID) prompts = await listPrompts(SEED_PROJECT_ID);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Prompt 管理</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="text-blue-600 hover:underline">Traces</Link>
          <Link href="/datasets" className="text-blue-600 hover:underline">数据集</Link>
          <Link href="/alerts" className="text-blue-600 hover:underline">告警</Link>
        </nav>
      </div>
      {error && <p className="text-red-600 mb-4">加载失败：{error}</p>}
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">名称</th>
              <th className="text-left px-4 py-2">描述</th>
              <th className="text-left px-4 py-2">当前版本</th>
              <th className="text-left px-4 py-2">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {prompts.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  暂无 Prompt，通过 API 创建一个试试
                </td>
              </tr>
            )}
            {prompts.map((p) => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/prompts/${p.id}`} className="font-medium text-blue-600 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{p.description ?? '-'}</td>
                <td className="px-4 py-2">
                  {p.latestVersion ? (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-green-100 text-green-700">
                      v{p.latestVersion}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(p.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
