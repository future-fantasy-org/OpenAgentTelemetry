export type TraceListItem = {
  id: string;
  name: string;
  userId: string | null;
  sessionId: string | null;
  timestamp: string;
};

const API_BASE = typeof window === 'undefined'
  ? (process.env.SERVER_URL ?? 'http://localhost:3001')
  : '';

export async function listTraces(projectId: string): Promise<TraceListItem[]> {
  const res = await fetch(`${API_BASE}/api/traces?projectId=${projectId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`查询 traces 失败: ${res.status}`);
  const data = await res.json();
  return data.traces;
}
