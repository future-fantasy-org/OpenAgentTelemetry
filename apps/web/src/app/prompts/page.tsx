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
    <main className="oat-page">
      <div className="oat-page-header">
        <h1 className="oat-page-title">Prompt 管理</h1>
        <p className="oat-page-subtitle">版本化 Prompt 模板与发布管理</p>
      </div>

      <div className="oat-card overflow-hidden">
        <table className="oat-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>描述</th>
              <th>当前版本</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {prompts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="h-10 w-10 text-slate-300"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15M9 12l3 3m0 0 3-3m-3 3V2.25"
                      />
                    </svg>
                    <span>暂无 Prompt，通过 API 创建一个试试</span>
                  </div>
                </td>
              </tr>
            )}
            {prompts.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link
                    href={`/prompts/${p.id}?projectId=${projectId}`}
                    className="oat-link font-medium"
                  >
                    {p.name}
                  </Link>
                </td>
                <td className="text-slate-500">{p.description ?? '-'}</td>
                <td>
                  {p.latestVersion ? (
                    <span className="oat-badge oat-badge-green font-data">
                      v{p.latestVersion}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="text-slate-500">
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
