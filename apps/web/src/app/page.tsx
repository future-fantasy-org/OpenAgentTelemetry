import Link from 'next/link';
import { listTraces } from '@/lib/api';

const SEED_PROJECT_ID = process.env.SEED_PROJECT_ID ?? '';

export default async function HomePage() {
  let traces: Awaited<ReturnType<typeof listTraces>> = [];
  let error: string | null = null;
  try {
    if (SEED_PROJECT_ID) traces = await listTraces(SEED_PROJECT_ID);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Traces</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/dashboard" className="text-blue-600 hover:underline">Dashboard</Link>
          <Link href="/datasets" className="text-blue-600 hover:underline">数据集</Link>
          <Link href="/prompts" className="text-blue-600 hover:underline">Prompt 管理</Link>
        </nav>
      </div>
      {error && <p className="text-red-600 mb-4">加载失败：{error}</p>}
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">名称</th>
              <th className="text-left px-4 py-2">用户</th>
              <th className="text-left px-4 py-2">会话</th>
              <th className="text-left px-4 py-2">时间</th>
            </tr>
          </thead>
          <tbody>
            {traces.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  暂无 trace，用 SDK 上报一条试试
                </td>
              </tr>
            )}
            {traces.map((t) => (
              <tr key={t.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/traces/${t.id}`} className="font-medium text-blue-600 hover:underline">
                    {t.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{t.userId ?? '-'}</td>
                <td className="px-4 py-2 text-gray-500">{t.sessionId ?? '-'}</td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(t.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
