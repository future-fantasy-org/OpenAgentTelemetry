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

export type StatsPoint = {
  bucket: string;
  traceCount: number;
  p50LatencyMs: number | null;
  p90LatencyMs: number | null;
  p99LatencyMs: number | null;
  promptTokens: number;
  completionTokens: number;
  totalCost: string;
};

export type StatsSummary = {
  totalTraces: number;
  totalTokens: number;
  totalCost: string;
  avgLatencyMs: number | null;
};

export type TopModel = {
  model: string;
  count: number;
  cost: string;
};

export type ScoreDistributionItem = {
  name: string;
  avgValue: number;
  count: number;
};

export type StatsOverview = {
  range: string;
  series: StatsPoint[];
  summary: StatsSummary;
  topModels: TopModel[];
  scoreDistribution: ScoreDistributionItem[];
};

const API_BASE = typeof window === 'undefined'
  ? (process.env.SERVER_URL ?? 'http://localhost:3001')
  : '';

async function get(url: string) {
  // credentials:'include' 让 fetch 带上 cookie（登录后存的 oat_session）
  const res = await fetch(url, { cache: 'no-store', credentials: 'include' });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  return res.json();
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  return res.json();
}

async function put(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  return res.json();
}

async function del(url: string) {
  const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
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

export async function getStatsOverview(projectId: string, range: string): Promise<StatsOverview> {
  return get(`${API_BASE}/api/stats/overview?projectId=${projectId}&range=${range}`);
}

// ---- Auth ----
export type AuthUser = { id: string; email: string; role: string };

export async function login(email: string, password: string): Promise<{ user: AuthUser }> {
  return post(`${API_BASE}/api/auth/login`, { email, password });
}

export async function logout(): Promise<{ ok: boolean }> {
  return post(`${API_BASE}/api/auth/logout`, {});
}

export async function getMe(): Promise<{ user: AuthUser }> {
  return get(`${API_BASE}/api/auth/me`);
}

// ---- Alerts ----
export type AlertRule = {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  metric: string;
  operator: string;
  threshold: string;
  windowSeconds: number;
  webhookUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AlertEvent = {
  id: string;
  ruleId: string;
  projectId: string;
  metricValue: string;
  threshold: string;
  triggeredAt: string;
  resolvedAt: string | null;
  notificationStatus: string;
};

export type NewAlertRule = {
  projectId: string;
  name: string;
  metric: string;
  operator?: string;
  threshold: number;
  windowSeconds?: number;
  webhookUrl?: string | null;
};

export async function listAlertRules(projectId: string): Promise<AlertRule[]> {
  const data = await get(`${API_BASE}/api/alerts/rules?projectId=${projectId}`);
  return data.rules;
}

export async function listAlertEvents(projectId: string, limit = 50): Promise<AlertEvent[]> {
  const data = await get(`${API_BASE}/api/alerts/events?projectId=${projectId}&limit=${limit}`);
  return data.events;
}

export async function createAlertRule(rule: NewAlertRule): Promise<AlertRule> {
  return post(`${API_BASE}/api/alerts/rules`, rule);
}

export async function updateAlertRule(id: string, patch: Partial<NewAlertRule> & { enabled?: boolean }): Promise<AlertRule> {
  return put(`${API_BASE}/api/alerts/rules/${id}`, patch);
}

export async function deleteAlertRule(id: string): Promise<void> {
  await del(`${API_BASE}/api/alerts/rules/${id}`);
}

export async function testAlertWebhook(id: string): Promise<{ ok: boolean }> {
  return post(`${API_BASE}/api/alerts/rules/${id}/test`, {});
}
