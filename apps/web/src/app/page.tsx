import Link from 'next/link';
import { getCurrentProjectId } from '@/lib/project-context';
import { listTraces } from '@/lib/api.server';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);
  const traces = await listTraces(projectId);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold mb-6">Traces</h1>
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
            {traces.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  暂无 trace，用 SDK 上报一条试试
                </td>
              </tr>
            )}
            {traces.map((t) => (
              <tr key={t.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/traces/${t.id}?projectId=${projectId}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
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
