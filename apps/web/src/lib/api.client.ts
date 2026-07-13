import { API_BASE, handleResponse } from './api.shared';
import type {
  StatsOverview,
  AlertRule,
  AlertEvent,
  NewAlertRule,
  AuthUser,
} from './api.shared';

export type { StatsOverview, AlertRule, AlertEvent, NewAlertRule, AuthUser } from './api.shared';

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
