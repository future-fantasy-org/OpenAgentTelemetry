import 'server-only';
import { cookies } from 'next/headers';
import { API_BASE, handleResponse } from './api.shared';
import type {
  TraceListItem,
  TraceDetail,
  ScoreItem,
  DatasetListItem,
  PromptListItem,
  PromptDetail,
  PromptVersion,
  ProjectListItem,
  AuthUser,
} from './api.shared';

async function buildHeaders(): Promise<HeadersInit> {
  const cookieStore = await cookies();
  const session = cookieStore.get('oat_session');
  return session ? { Cookie: `oat_session=${session.value}` } : {};
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    cache: 'no-store',
    credentials: 'include',
    headers: await buildHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  return handleResponse<T>(res);
}

export async function listTraces(projectId: string): Promise<TraceListItem[]> {
  const data = await get<{ traces: TraceListItem[] }>(`/api/traces?projectId=${projectId}`);
  return data.traces;
}

export async function getTraceDetail(id: string): Promise<TraceDetail> {
  return get(`/api/traces/${id}`);
}

export async function listScores(traceId: string): Promise<ScoreItem[]> {
  const data = await get<{ scores: ScoreItem[] }>(`/api/traces/${traceId}/scores`);
  return data.scores;
}

export async function listDatasets(projectId: string): Promise<DatasetListItem[]> {
  const data = await get<{ datasets: DatasetListItem[] }>(`/api/datasets?projectId=${projectId}`);
  return data.datasets;
}

export async function listPrompts(projectId: string): Promise<PromptListItem[]> {
  const data = await get<{ prompts: PromptListItem[] }>(`/api/prompts?projectId=${projectId}`);
  return data.prompts;
}

export async function getPromptDetail(
  id: string,
): Promise<{ prompt: PromptDetail; versions: PromptVersion[] }> {
  return get(`/api/prompts/${id}`);
}

export async function listProjects(): Promise<{ projects: ProjectListItem[] }> {
  return get(`/api/projects`);
}

export async function getMe(): Promise<{ user: AuthUser }> {
  return get(`/api/auth/me`);
}
