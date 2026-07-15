import Link from 'next/link';
import { getTraceDetail, listScores } from '@/lib/api.server';
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
const typeStyles: Record<string, { label: string; badge: string; bar: string }> = {
  span: { label: 'SPAN', badge: 'oat-badge-blue', bar: 'bg-indigo-400' },
  generation: { label: 'GEN', badge: 'oat-badge-purple', bar: 'bg-violet-400' },
  event: { label: 'EVENT', badge: 'oat-badge-amber', bar: 'bg-amber-400' },
};

export default async function TraceDetailPage({ params }: { params: { id: string } }) {
  const trace = await getTraceDetail(params.id);
  const scores = await listScores(params.id);

  if (!trace) {
    return (
      <main className="oat-page">
        <Link href="/" className="oat-link-quiet mb-6 inline-flex items-center gap-1 text-sm">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回列表
        </Link>
        <div className="oat-card-pad text-slate-500">
          Trace 不存在或暂时无法加载（可能是请求被限流，请稍后再试）。
        </div>
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

  const stats = [
    { label: '总耗时', value: formatDuration(maxTime - minTime) },
    { label: '节点数', value: String(trace.observations.length) },
    { label: 'LLM 调用', value: String(generations) },
    ...(totalTokens > 0 ? [{ label: 'Tokens', value: totalTokens.toLocaleString() }] : []),
  ];

  return (
    <main className="oat-page-wide">
      <Link href="/" className="oat-link-quiet mb-6 inline-flex items-center gap-1 text-sm">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        返回列表
      </Link>

      <div className="oat-page-header">
        <div>
          <h1 className="oat-page-title">{trace.name}</h1>
          <div className="oat-page-subtitle font-data">{trace.id}</div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="oat-card-pad">
            <div className="oat-kpi-label">{s.label}</div>
            <div className="oat-kpi-value">{s.value}</div>
          </div>
        ))}
      </div>

      {flatNodes.length === 0 ? (
        <div className="oat-card-pad text-slate-400">此 trace 没有子节点</div>
      ) : (
        <div className="oat-card overflow-hidden">
          {flatNodes.map(({ obs, depth }) => {
            const style = typeStyles[obs.type] ?? typeStyles.span;
            const startMs = new Date(obs.startTime).getTime() - minTime;
            const endMs = obs.endTime ? new Date(obs.endTime).getTime() - minTime : startMs;
            const widthPct = Math.max(((endMs - startMs) / totalSpan) * 100, 0.5);
            const leftPct = (startMs / totalSpan) * 100;

            return (
              <div key={obs.id} className="border-b border-slate-100 px-5 py-3 transition-colors last:border-0 hover:bg-slate-50/70">
                <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 24}px` }}>
                  <span className={`oat-badge font-data ${style.badge}`}>{style.label}</span>
                  <span className="text-sm font-medium text-slate-800">{obs.name}</span>
                  <span className="ml-auto font-data text-xs text-slate-400">
                    {formatDuration(endMs - startMs)}
                  </span>
                </div>

                {/* Waterfall 瀑布条 */}
                <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
                     style={{ marginLeft: `${depth * 24}px` }}>
                  <div
                    className={`absolute h-full rounded-full ${style.bar}`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                </div>

                {/* 元数据：模型、tokens */}
                {(obs.model || obs.promptTokens) && (
                  <div className="mt-1.5 flex flex-wrap gap-3 font-data text-xs text-slate-400"
                       style={{ paddingLeft: `${depth * 24}px` }}>
                    {obs.model && <span>模型: {obs.model}</span>}
                    {obs.promptTokens != null && (
                      <span>tokens: {obs.promptTokens} → {obs.completionTokens}</span>
                    )}
                  </div>
                )}

                {/* input/output（可展开的 JSON） */}
                {obs.input != null && (
                  <details className="mt-2" style={{ paddingLeft: `${depth * 24}px` }}>
                    <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">输入</summary>
                    <pre className="mt-1.5 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 font-data text-xs text-slate-100">
                      {JSON.stringify(obs.input, null, 2)}
                    </pre>
                  </details>
                )}
                {obs.output != null && (
                  <details className="mt-2" style={{ paddingLeft: `${depth * 24}px` }}>
                    <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">输出</summary>
                    <pre className="mt-1.5 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 font-data text-xs text-slate-100">
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
          <h2 className="mb-3 text-sm font-semibold text-slate-700">评分（{scores.length}）</h2>
          <div className="oat-card overflow-hidden">
            <table className="oat-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>分数</th>
                  <th>来源</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium text-slate-800">{s.name}</td>
                    <td className="font-data font-semibold text-violet-600">{s.value}</td>
                    <td className="text-slate-500">{s.source}</td>
                    <td className="text-slate-500">{s.comment ?? '-'}</td>
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
