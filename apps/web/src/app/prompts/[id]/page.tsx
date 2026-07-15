import Link from 'next/link';
import { getPromptDetail } from '@/lib/api.server';

export default async function PromptDetailPage({ params }: { params: { id: string } }) {
  let data;
  let error: string | null = null;
  try {
    data = await getPromptDetail(params.id);
  } catch (e) {
    error = (e as Error).message;
  }

  if (error || !data) {
    return (
      <main className="oat-page">
        <div className="mb-6">
          <Link href="/prompts" className="oat-link-quiet">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            返回 Prompt 列表
          </Link>
        </div>
        <div className="oat-card oat-card-pad text-rose-600">{error ?? '加载失败'}</div>
      </main>
    );
  }

  const { prompt, versions } = data;
  const activeVersion = versions.find((v) => v.isActive) ?? versions[0];

  return (
    <main className="oat-page">
      <div className="mb-6">
        <Link href="/prompts" className="oat-link-quiet">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-4 w-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          返回 Prompt 列表
        </Link>
      </div>

      <div className="oat-page-header mb-6">
        <h1 className="oat-page-title">{prompt.name}</h1>
        {prompt.description && <p className="oat-page-subtitle">{prompt.description}</p>}
      </div>

      {activeVersion && (
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-700">当前版本</h2>
            <span className="oat-badge oat-badge-green font-data">
              v{activeVersion.version}
            </span>
            {activeVersion.labels?.map((l) => (
              <span key={l} className="oat-badge oat-badge-blue font-data">
                {l}
              </span>
            ))}
          </div>
          <pre className="rounded-xl bg-slate-900 p-4 font-data text-sm text-slate-100 overflow-auto whitespace-pre-wrap">
            {activeVersion.template}
          </pre>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">版本历史（{versions.length}）</h2>
        <div className="space-y-3">
          {versions.map((v) => (
            <div
              key={v.id}
              className={`rounded-xl border p-4 ${
                v.isActive ? 'border-emerald-300 bg-emerald-50/50' : 'oat-card'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-data text-sm font-semibold">v{v.version}</span>
                {v.isActive && (
                  <span className="oat-badge oat-badge-green">激活中</span>
                )}
                {v.labels?.map((l) => (
                  <span key={l} className="oat-badge oat-badge-blue font-data">
                    {l}
                  </span>
                ))}
                <span className="ml-auto text-xs text-slate-400">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
              </div>
              <pre className="rounded-lg bg-slate-100 p-3 font-data text-xs overflow-auto max-h-40 whitespace-pre-wrap text-slate-700">
                {v.template}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
