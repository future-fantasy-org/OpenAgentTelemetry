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
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-6">
        <Link href="/datasets" className="text-sm text-gray-500 hover:text-gray-700">← 返回数据集列表</Link>
      </div>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      {dataset && (
        <>
          <h1 className="text-2xl font-bold mb-1">{dataset.name}</h1>
          {dataset.description && <p className="text-gray-500 mb-6">{dataset.description}</p>}

          <h2 className="text-lg font-semibold mb-3">测试样例（{items.length}）</h2>
          <div className="space-y-3">
            {items.length === 0 && (
              <p className="text-gray-400 text-sm">暂无样例</p>
            )}
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border bg-white p-4">
                <div className="text-xs text-gray-400 mb-2">{item.id}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-semibold text-gray-500 mb-1">输入</div>
                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-40">
                      {JSON.stringify(item.input, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500 mb-1">期望输出</div>
                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-40">
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
