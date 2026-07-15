import Link from 'next/link';

const API_BASE = typeof window === 'undefined'
  ? (process.env.SERVER_URL ?? 'http://localhost:3001')
  : '';

type DatasetRow = {
  id: string;
  input: unknown;
  expectedOutput: unknown;
  createdAt: string;
};

export default async function DatasetDetailPage({ params }: { params: { id: string } }) {
  let dataset: { id: string; name: string; description: string | null } | null = null;
  let items: DatasetRow[] = [];
  let error: string | null = null;

  try {
    const res = await fetch(`${API_BASE}/api/datasets/${params.id}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`加载失败: ${res.status}`);
    const data = await res.json();
    dataset = data.dataset;
    items = data.items;
  } catch (e) {
    error = (e as Error).message;
  }

  if (!dataset && !error) error = '数据集不存在';

  return (
    <main className="oat-page">
      <div className="mb-6">
        <Link href="/datasets" className="oat-link-quiet">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>返回数据集列表</span>
        </Link>
      </div>

      {error && <div className="oat-card-pad text-rose-600 mb-6">{error}</div>}

      {dataset && (
        <>
          <header className="oat-page-header">
            <h1 className="oat-page-title">{dataset.name}</h1>
            {dataset.description && <p className="oat-page-subtitle">{dataset.description}</p>}
          </header>

          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            测试样例（{items.length}）
          </h2>
          <div className="space-y-3">
            {items.length === 0 && (
              <p className="text-slate-400 text-sm">暂无样例</p>
            )}
            {items.map((item) => (
              <div key={item.id} className="oat-card-pad">
                <div className="font-data text-xs text-slate-400 mb-2">{item.id}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-1">输入</div>
                    <pre className="rounded-lg bg-slate-900 p-3 font-data text-xs text-slate-100 overflow-auto max-h-40">
                      {JSON.stringify(item.input, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-1">期望输出</div>
                    <pre className="rounded-lg bg-slate-900 p-3 font-data text-xs text-slate-100 overflow-auto max-h-40">
                      {item.expectedOutput ? JSON.stringify(item.expectedOutput, null, 2) : '-'}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
