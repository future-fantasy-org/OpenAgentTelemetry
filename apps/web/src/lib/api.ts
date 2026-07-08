export type TraceListItem = {
  id: string;
  name: string;
  userId: string | null;
  sessionId: string | null;
  timestamp: string;
};

export async function listTraces(projectId: string): Promise<TraceListItem[]> {
  const res = await fetch(`/api/traces?projectId=${projectId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`查询 traces 失败: ${res.status}`);
  const data = await res.json();
  return data.traces;
}
