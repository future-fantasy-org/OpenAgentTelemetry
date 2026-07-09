import Link from 'next/link';
import { getPromptDetail } from '@/lib/api';

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
      <main className="mx-auto max-w-4xl p-8">
        <div className="mb-6">
          <Link href="/prompts" className="text-sm text-gray-500 hover:text-gray-700">← 返回 Prompt 列表</Link>
        </div>
        <p className="text-red-600">{error ?? '加载失败'}</p>
      </main>
    );
  }

  const { prompt, versions } = data;
  const activeVersion = versions.find((v) => v.isActive) ?? versions[0];

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6">
        <Link href="/prompts" className="text-sm text-gray-500 hover:text-gray-700">← 返回 Prompt 列表</Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">{prompt.name}</h1>
        {prompt.description && <p className="text-gray-500 mt-1">{prompt.description}</p>}
      </div>

      {activeVersion && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-lg font-semibold">当前版本</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-green-100 text-green-700">
              v{activeVersion.version}
            </span>
            {activeVersion.labels?.map((l) => (
              <span key={l} className="text-xs font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                {l}
              </span>
            ))}
          </div>
          <pre className="text-sm bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto whitespace-pre-wrap">
            {activeVersion.template}
          </pre>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">版本历史（{versions.length}）</h2>
        <div className="space-y-3">
          {versions.map((v) => (
            <div key={v.id} className={`rounded-lg border p-4 ${v.isActive ? 'border-green-400 bg-green-50' : 'bg-white'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-mono font-semibold">v{v.version}</span>
                {v.isActive && (
                  <span className="text-xs px-2 py-0.5 rounded bg-green-200 text-green-800">激活中</span>
                )}
                {v.labels?.map((l) => (
                  <span key={l} className="text-xs font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                    {l}
                  </span>
                ))}
                <span className="text-xs text-gray-400 ml-auto">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
              </div>
              <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-40 whitespace-pre-wrap">
                {v.template}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
