import { API_BASE, handleResponse } from './api.shared';
import type {
  StatsOverview,
  AlertRule,
  AlertEvent,
  NewAlertRule,
  AuthUser,
  AuditLog,
  TraceListItem,
  LlmProvider,
  NewLlmProvider,
  Evaluator,
  NewEvaluator,
  EvalJob,
  EvalJobItem,
  NewEvalJob,
} from './api.shared';

export type {
  StatsOverview, AlertRule, AlertEvent, NewAlertRule, AuthUser, AuditLog, TraceListItem,
  LlmProvider, NewLlmProvider, Evaluator, NewEvaluator, EvalJob, EvalJobItem, NewEvalJob,
} from './api.shared';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    signal: AbortSignal.timeout(15000),
  });
  return handleResponse<T>(res);
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  return handleResponse<T>(res);
}

async function put<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return handleResponse<T>(res);
}

async function del<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'DELETE',
    credentials: 'include',
    signal: AbortSignal.timeout(15000),
  });
  return handleResponse<T>(res);
}

export async function getStatsOverview(
  projectId: string,
  range: string,
): Promise<StatsOverview> {
  return get(`/api/stats/overview?projectId=${projectId}&range=${range}`);
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: AuthUser }> {
  return post(`/api/auth/login`, { email, password });
}

export async function logout(): Promise<{ ok: boolean }> {
  return post(`/api/auth/logout`, {});
}

export async function listAlertRules(projectId: string): Promise<AlertRule[]> {
  const data = await get<{ rules: AlertRule[] }>(`/api/alerts/rules?projectId=${projectId}`);
  return data.rules;
}

export async function listAlertEvents(
  projectId: string,
  limit = 50,
): Promise<AlertEvent[]> {
  const data = await get<{ events: AlertEvent[] }>(
    `/api/alerts/events?projectId=${projectId}&limit=${limit}`,
  );
  return data.events;
}

export async function createAlertRule(rule: NewAlertRule): Promise<AlertRule> {
  return post(`/api/alerts/rules`, rule);
}

export async function updateAlertRule(
  id: string,
  patch: Partial<NewAlertRule> & { enabled?: boolean },
): Promise<AlertRule> {
  return put(`/api/alerts/rules/${id}`, patch);
}

export async function deleteAlertRule(id: string): Promise<void> {
  await del(`/api/alerts/rules/${id}`);
}

export async function testAlertWebhook(id: string): Promise<{ ok: boolean }> {
  return post(`/api/alerts/rules/${id}/test`, {});
}

export async function listAuditLogs(params: {
  projectId?: string;
  action?: string;
  actor?: string;
  cursor?: string;
  limit?: number;
} = {}): Promise<{ logs: AuditLog[]; nextCursor: string | null }> {
  const qs = new URLSearchParams();
  if (params.projectId) qs.set('projectId', params.projectId);
  if (params.action) qs.set('action', params.action);
  if (params.actor) qs.set('actor', params.actor);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  return get(`/api/audit/logs?${qs.toString()}`);
}

export async function listTracesClient(params: {
  projectId: string;
  cursor?: string;
  limit?: number;
}): Promise<{ traces: TraceListItem[]; nextCursor: string | null }> {
  const qs = new URLSearchParams();
  qs.set('projectId', params.projectId);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  return get(`/api/traces?${qs.toString()}`);
}

// ===== M13: Eval Provider =====
export async function listProviders(): Promise<LlmProvider[]> {
  const data = await get<{ providers: LlmProvider[] }>(`/api/eval/providers`);
  return data.providers;
}
export async function createProvider(input: NewLlmProvider): Promise<LlmProvider> {
  return post(`/api/eval/providers`, input);
}
export async function updateProvider(id: string, patch: Partial<NewLlmProvider>): Promise<LlmProvider> {
  return put(`/api/eval/providers/${id}`, patch);
}
export async function deleteProvider(id: string): Promise<void> {
  await del(`/api/eval/providers/${id}`);
}
export async function testProvider(id: string): Promise<{ ok: boolean; message?: string }> {
  return post(`/api/eval/providers/${id}/test`, {});
}

// ===== M13: Evaluator =====
export async function listEvaluators(projectId: string): Promise<Evaluator[]> {
  const data = await get<{ evaluators: Evaluator[] }>(`/api/eval/evaluators?projectId=${projectId}`);
  return data.evaluators;
}
export async function createEvaluator(input: NewEvaluator): Promise<Evaluator> {
  return post(`/api/eval/evaluators`, input);
}
export async function updateEvaluator(id: string, patch: Partial<NewEvaluator>): Promise<Evaluator> {
  return put(`/api/eval/evaluators/${id}`, patch);
}
export async function deleteEvaluator(id: string): Promise<void> {
  await del(`/api/eval/evaluators/${id}`);
}

// ===== M13: Eval Job =====
export async function listEvalJobs(projectId: string): Promise<{ jobs: EvalJob[]; nextCursor: string | null }> {
  return get(`/api/eval/jobs?projectId=${projectId}`);
}
export async function getEvalJob(id: string): Promise<EvalJob> {
  return get(`/api/eval/jobs/${id}`);
}
export async function createEvalJob(input: NewEvalJob): Promise<EvalJob> {
  return post(`/api/eval/jobs`, input);
}
export async function listJobItems(jobId: string, status?: string): Promise<{ items: EvalJobItem[]; nextCursor: string | null }> {
  const qs = status ? `?status=${status}` : '';
  return get(`/api/eval/jobs/${jobId}/items${qs}`);
}
export async function cancelEvalJob(id: string): Promise<{ ok: boolean }> {
  return post(`/api/eval/jobs/${id}/cancel`, {});
}
