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

/**
 * 安全获取数据：遇到限流(429)、网络错误、超时等非鉴权异常时，
 * 返回 fallback 默认值而不是抛出，避免整页 SSR 崩溃。
 * 鉴权类错误(401)仍由 handleResponse 正常处理跳转。
 */
async function safeGet<T>(url: string, fallback: T): Promise<T> {
  try {
    return await get<T>(url);
  } catch (err) {
    // 401 跳转已在 handleResponse 处理，这里不吞掉
    if (err instanceof Error && err.message === 'SESSION_EXPIRED') throw err;
    // 其余错误（限流、网络、超时）静默降级
    console.warn(`[safeGet] ${url} 降级为默认值:`, (err as Error).message);
    return fallback;
  }
}

export async function listTraces(projectId: string): Promise<TraceListItem[]> {
  const data = await safeGet<{ traces: TraceListItem[] }>(
    `/api/traces?projectId=${projectId}`,
    { traces: [] },
  );
  return data.traces;
}

export async function getTraceDetail(id: string): Promise<TraceDetail | null> {
  return safeGet<TraceDetail | null>(`/api/traces/${id}`, null);
}

export async function listScores(traceId: string): Promise<ScoreItem[]> {
  const data = await safeGet<{ scores: ScoreItem[] }>(
    `/api/traces/${traceId}/scores`,
    { scores: [] },
  );
  return data.scores;
}

export async function listDatasets(projectId: string): Promise<DatasetListItem[]> {
  const data = await safeGet<{ datasets: DatasetListItem[] }>(
    `/api/datasets?projectId=${projectId}`,
    { datasets: [] },
  );
  return data.datasets;
}

export async function listPrompts(projectId: string): Promise<PromptListItem[]> {
  const data = await safeGet<{ prompts: PromptListItem[] }>(
    `/api/prompts?projectId=${projectId}`,
    { prompts: [] },
  );
  return data.prompts;
}

export async function getPromptDetail(
  id: string,
): Promise<{ prompt: PromptDetail; versions: PromptVersion[] } | null> {
  return safeGet<{ prompt: PromptDetail; versions: PromptVersion[] } | null>(
    `/api/prompts/${id}`,
    null,
  );
}

export async function listProjects(): Promise<{ projects: ProjectListItem[] }> {
  return safeGet<{ projects: ProjectListItem[] }>(`/api/projects`, { projects: [] });
}

export async function getMe(): Promise<{ user: AuthUser } | null> {
  return safeGet<{ user: AuthUser } | null>(`/api/auth/me`, null);
}
