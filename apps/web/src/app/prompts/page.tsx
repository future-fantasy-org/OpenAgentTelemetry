import Link from 'next/link';
import { getCurrentProjectId } from '@/lib/project-context';
import { listPrompts } from '@/lib/api.server';

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);
  const prompts = await listPrompts(projectId);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold mb-6">Prompt 管理</h1>
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
            {prompts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  暂无 Prompt，通过 API 创建一个试试
                </td>
              </tr>
            )}
            {prompts.map((p) => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/prompts/${p.id}?projectId=${projectId}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{p.description ?? '-'}</td>
                <td className="px-4 py-2">
                  {p.latestVersion ? (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-green-100 text-green-700">
                      v{p.latestVersion}
                    </span>
                  ) : (
                    '-'
                  )}
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
