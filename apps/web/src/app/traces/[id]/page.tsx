import Link from 'next/link';
import { getTraceDetail, listScores } from '@/lib/api';
import type { ObservationDetail } from '@/lib/api';

// 把扁平的 observations 列表构建成树（用 parentId 找父亲）
type TreeNode = { obs: ObservationDetail; children: TreeNode[]; depth: number };

function buildTree(observations: ObservationDetail[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // 第一遍：给每个 observation 创建节点
  for (const obs of observations) {
    map.set(obs.id, { obs, children: [], depth: 0 });
  }

  // 第二遍：根据 parentId 挂到父亲下面
  for (const obs of observations) {
    const node = map.get(obs.id)!;
    if (obs.parentId && map.has(obs.parentId)) {
      const parent = map.get(obs.parentId)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 计算每个节点的深度（用于缩进显示）
  function setDepth(node: TreeNode, depth: number) {
    node.depth = depth;
    for (const child of node.children) setDepth(child, depth + 1);
  }
  for (const root of roots) setDepth(root, 0);

  return roots;
}

function collectAll(nodes: TreeNode[]): TreeNode[] {
  // 深度优先遍历，把树拍平成列表（按时间顺序展示）
  const result: TreeNode[] = [];
  function walk(node: TreeNode) {
    result.push(node);
    for (const child of node.children) walk(child);
  }
  for (const node of nodes) walk(node);
  return result;
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// 不同类型的样式（颜色 + 标签）
const typeStyles: Record<string, { label: string; color: string; barColor: string }> = {
  span: { label: 'SPAN', color: 'bg-blue-100 text-blue-700', barColor: 'bg-blue-400' },
  generation: { label: 'GEN', color: 'bg-purple-100 text-purple-700', barColor: 'bg-purple-400' },
  event: { label: 'EVENT', color: 'bg-amber-100 text-amber-700', barColor: 'bg-amber-400' },
};

export default async function TraceDetailPage({ params }: { params: { id: string } }) {
  let trace;
  let scores = [];
  try {
    trace = await getTraceDetail(params.id);
    scores = await listScores(params.id);
  } catch {
    return (
      <main className="mx-auto max-w-6xl p-8">
        <div className="mb-6">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">← 返回列表</Link>
        </div>
        <p className="text-red-600">Trace 不存在或加载失败</p>
      </main>
    );
  }
  const tree = buildTree(trace.observations);
  const flatNodes = collectAll(tree);

  // 计算时间范围（用于 waterfall 的比例条）
  const times = trace.observations.flatMap((o) => [o.startTime, o.endTime].filter(Boolean) as string[]);
  const minTime = times.length > 0 ? new Date(Math.min(...times.map((t) => new Date(t).getTime()))).getTime() : 0;
  const maxTime = times.length > 0 ? new Date(Math.max(...times.map((t) => new Date(t).getTime()))).getTime() : 0;
  const totalSpan = maxTime - minTime || 1;

  // 概要统计
  const totalTokens = trace.observations.reduce((sum, o) => sum + (o.promptTokens ?? 0) + (o.completionTokens ?? 0), 0);
  const generations = trace.observations.filter((o) => o.type === 'generation').length;

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">← 返回列表</Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">{trace.name}</h1>
        <div className="mt-2 flex gap-6 text-sm text-gray-500">
          <span>耗时 {formatDuration(maxTime - minTime)}</span>
          <span>节点 {trace.observations.length}</span>
          <span>LLM 调用 {generations}</span>
          {totalTokens > 0 && <span>Tokens {totalTokens}</span>}
        </div>
      </div>

      {flatNodes.length === 0 ? (
        <p className="text-gray-400">此 trace 没有子节点</p>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          {flatNodes.map(({ obs, depth }) => {
            const style = typeStyles[obs.type] ?? typeStyles.span;
            const startMs = new Date(obs.startTime).getTime() - minTime;
            const endMs = obs.endTime ? new Date(obs.endTime).getTime() - minTime : startMs;
            const widthPct = Math.max(((endMs - startMs) / totalSpan) * 100, 0.5);
            const leftPct = (startMs / totalSpan) * 100;

            return (
              <div key={obs.id} className="border-b last:border-0 px-4 py-2 hover:bg-gray-50">
                <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 24}px` }}>
                  {/* 类型标签 */}
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${style.color}`}>
                    {style.label}
                  </span>
                  {/* 名称 */}
                  <span className="text-sm font-medium">{obs.name}</span>
                  {/* 耗时 */}
                  <span className="text-xs text-gray-400 ml-auto">
                    {formatDuration(endMs - startMs)}
                  </span>
                </div>

                {/* Waterfall 瀑布条 */}
                <div className="mt-1 h-2 bg-gray-100 rounded relative overflow-hidden"
                     style={{ marginLeft: `${depth * 24}px` }}>
                  <div
                    className={`absolute h-full rounded ${style.barColor}`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                </div>

                {/* 元数据：模型、tokens */}
                {(obs.model || obs.promptTokens) && (
                  <div className="mt-1 flex gap-3 text-xs text-gray-400"
                       style={{ paddingLeft: `${depth * 24}px` }}>
                    {obs.model && <span>模型: {obs.model}</span>}
                    {obs.promptTokens != null && (
                      <span>tokens: {obs.promptTokens}→{obs.completionTokens}</span>
                    )}
                  </div>
                )}

                {/* input/output（可展开的 JSON） */}
                {obs.input != null && (
                  <details className="mt-1" style={{ paddingLeft: `${depth * 24}px` }}>
                    <summary className="text-xs text-gray-500 cursor-pointer">输入</summary>
                    <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-auto max-h-40">
                      {JSON.stringify(obs.input, null, 2)}
                    </pre>
                  </details>
                )}
                {obs.output != null && (
                  <details className="mt-1" style={{ paddingLeft: `${depth * 24}px` }}>
                    <summary className="text-xs text-gray-500 cursor-pointer">输出</summary>
                    <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-auto max-h-40">
                      {JSON.stringify(obs.output, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      {scores.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-3">评分（{scores.length}）</h2>
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">名称</th>
                  <th className="text-left px-4 py-2">分数</th>
                  <th className="text-left px-4 py-2">来源</th>
                  <th className="text-left px-4 py-2">备注</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-purple-600 font-mono">{s.value}</td>
                    <td className="px-4 py-2 text-gray-500">{s.source}</td>
                    <td className="px-4 py-2 text-gray-500">{s.comment ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
