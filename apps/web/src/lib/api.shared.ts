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

export type AuthUser = { id: string; email: string; role: string };

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

export type ProjectListItem = {
  id: string;
  name: string;
  apiKeyPreview: string;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  actorIp: string | null;
  action: string;
  method: string;
  path: string;
  resourceType: string | null;
  resourceId: string | null;
  projectId: string | null;
  statusCode: number;
  durationMs: number | null;
  metadata: Record<string, unknown>;
};

// M13: Eval 相关类型
export type LlmProvider = {
  id: string;
  name: string;
  provider: 'openai' | 'custom' | 'ollama';
  baseURL: string;
  apiKeyPreview: string;
  defaultModel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewLlmProvider = {
  name: string;
  provider: 'openai' | 'custom' | 'ollama';
  baseURL: string;
  apiKey: string;
  defaultModel?: string;
};

export type EvaluatorType = 'llm_judge' | 'numeric_threshold';

export type LlmJudgeConfig = {
  providerId: string;
  model: string;
  judgePrompt: string;
  min: number;
  max: number;
};

export type NumericThresholdConfig = {
  metric: 'latency_ms' | 'prompt_tokens' | 'completion_tokens' | 'total_cost';
  operator: 'lt' | 'lte' | 'gt' | 'gte';
  threshold: number;
  passScore: number;
  failScore: number;
};

export type Evaluator = {
  id: string;
  projectId: string;
  name: string;
  type: EvaluatorType;
  config: LlmJudgeConfig | NumericThresholdConfig;
  createdAt: string;
  updatedAt: string;
};

export type NewEvaluator = {
  projectId: string;
  name: string;
  type: EvaluatorType;
  config: LlmJudgeConfig | NumericThresholdConfig;
};

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

export type JobSummary = Record<string, { avg: number; passRate: number; count: number }>;

export type EvalJob = {
  id: string;
  projectId: string;
  name: string;
  datasetId: string;
  promptId: string;
  promptVersion: number;
  providerId: string;
  model: string;
  evaluatorIds: string[];
  status: JobStatus;
  concurrency: number;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  summary: JobSummary | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type JobItemStatus = 'pending' | 'running' | 'success' | 'failed';

export type EvalJobItem = {
  id: string;
  jobId: string;
  datasetItemId: string;
  status: JobItemStatus;
  output: unknown;
  traceId: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type NewEvalJob = {
  projectId: string;
  name: string;
  datasetId: string;
  promptId: string;
  promptVersion: number;
  providerId: string;
  model: string;
  evaluatorIds: string[];
  concurrency?: number;
};

export const isServer = typeof window === 'undefined';

export const API_BASE = isServer
  ? (process.env.SERVER_URL ?? 'http://localhost:3001')
  : '';

// 限流错误：429 Too Many Requests
export class RateLimitError extends Error {
  retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export async function handleResponse<T = unknown>(res: Response): Promise<T> {
  if (res.status === 401) {
    if (isServer) {
      const { redirect } = await import('next/navigation');
      redirect('/login');
    } else {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
      throw new Error('SESSION_EXPIRED');
    }
  }
  if (res.status === 429) {
    // 优先用 Retry-After 头，否则默认 60s
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '60', 10) || 60;
    let msg = '请求过于频繁，请稍后再试';
    try {
      const body = await res.json();
      msg = body?.error?.message ?? body?.message ?? msg;
    } catch {}
    throw new RateLimitError(msg, retryAfter);
  }
  if (!res.ok) {
    let msg = `请求失败: ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message ?? body?.message ?? msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
