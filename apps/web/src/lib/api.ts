export type TraceListItem = {
  id: string;
  name: string;
  userId: string | null;
  sessionId: string | null;
  timestamp: string;
};

export type ObservationDetail = {
  id: string;
  parentId: string | null;
  type: string;
  name: string;
  startTime: string;
  endTime: string | null;
  input: unknown;
  output: unknown;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalCost: string | null;
  level: string | null;
  metadata: unknown;
};

export type TraceDetail = {
  id: string;
  name: string;
  userId: string | null;
  sessionId: string | null;
  input: unknown;
  output: unknown;
  metadata: unknown;
  timestamp: string;
  observations: ObservationDetail[];
};

export type ScoreItem = {
  id: string;
  traceId: string | null;
  observationId: string | null;
  name: string;
  value: string;
  comment: string | null;
  source: string;
  createdAt: string;
};

export type DatasetListItem = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
};

export type PromptListItem = {
  id: string;
  name: string;
  description: string | null;
  latestVersion: number | null;
  updatedAt: string;
};

export type PromptVersion = {
  id: string;
  version: number;
  template: string;
  config: unknown;
  labels: string[] | null;
  isActive: boolean;
  createdAt: string;
};

export type PromptDetail = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

const API_BASE = typeof window === 'undefined'
  ? (process.env.SERVER_URL ?? 'http://localhost:3001')
  : '';

async function get(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  return res.json();
}

export async function listTraces(projectId: string): Promise<TraceListItem[]> {
  const data = await get(`${API_BASE}/api/traces?projectId=${projectId}`);
  return data.traces;
}

export async function getTraceDetail(id: string): Promise<TraceDetail> {
  return get(`${API_BASE}/api/traces/${id}`);
}

export async function listScores(traceId: string): Promise<ScoreItem[]> {
  const data = await get(`${API_BASE}/api/traces/${traceId}/scores`);
  return data.scores;
}

export async function listDatasets(projectId: string): Promise<DatasetListItem[]> {
  const data = await get(`${API_BASE}/api/datasets?projectId=${projectId}`);
  return data.datasets;
}

export async function listPrompts(projectId: string): Promise<PromptListItem[]> {
  const data = await get(`${API_BASE}/api/prompts?projectId=${projectId}`);
  return data.prompts;
}

export async function getPromptDetail(id: string): Promise<{ prompt: PromptDetail; versions: PromptVersion[] }> {
  return get(`${API_BASE}/api/prompts/${id}`);
}
