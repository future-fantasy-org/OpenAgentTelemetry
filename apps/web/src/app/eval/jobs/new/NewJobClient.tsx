'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createEvalJob, listEvaluators, listProviders } from '@/lib/api.client';
import type {
  DatasetListItem,
  Evaluator,
  LlmProvider,
  PromptListItem,
  PromptVersion,
} from '@/lib/api.shared';

async function loadDatasets(projectId: string): Promise<DatasetListItem[]> {
  const res = await fetch(`/api/datasets?projectId=${projectId}`, { credentials: 'include' });
  const data = await res.json();
  return data.datasets ?? [];
}

async function loadPrompts(projectId: string): Promise<PromptListItem[]> {
  const res = await fetch(`/api/prompts?projectId=${projectId}`, { credentials: 'include' });
  const data = await res.json();
  return data.prompts ?? [];
}

async function loadPromptVersions(promptId: string): Promise<PromptVersion[]> {
  const res = await fetch(`/api/prompts/${promptId}`, { credentials: 'include' });
  const data = await res.json();
  return data.versions ?? [];
}

export function NewJobClient({ sp }: { sp: { projectId?: string } }) {
  const projectId = sp.projectId ?? '';
  const router = useRouter();

  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [prompts, setPrompts] = useState<PromptListItem[]>([]);
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [promptId, setPromptId] = useState('');
  const [promptVersion, setPromptVersion] = useState('');
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [evaluatorIds, setEvaluatorIds] = useState<string[]>([]);
  const [concurrency, setConcurrency] = useState('3');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      loadDatasets(projectId),
      loadPrompts(projectId),
      listProviders(),
      listEvaluators(projectId),
    ])
      .then(([ds, ps, provs, evals]) => {
        if (cancelled) return;
        setDatasets(ds);
        setPrompts(ps);
        setProviders(provs);
        setEvaluators(evals);
        if (ds.length > 0) setDatasetId(ds[0].id);
        if (ps.length > 0) setPromptId(ps[0].id);
        if (provs.length > 0) {
          setProviderId(provs[0].id);
          if (provs[0].defaultModel) setModel(provs[0].defaultModel);
        }
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!promptId) {
      setVersions([]);
      setPromptVersion('');
      return;
    }
    let cancelled = false;
    loadPromptVersions(promptId)
      .then((vs) => {
        if (cancelled) return;
        setVersions(vs);
        const active = vs.find((v) => v.isActive);
        if (active) {
          setPromptVersion(String(active.version));
        } else if (vs.length > 0) {
          setPromptVersion(String(vs[0].version));
        }
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  function handleProviderChange(id: string) {
    setProviderId(id);
    const p = providers.find((x) => x.id === id);
    if (p?.defaultModel) {
      setModel(p.defaultModel);
    }
  }

  function toggleEvaluator(id: string) {
    setEvaluatorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSubmitting(true);
    setError(null);
    try {
      const job = await createEvalJob({
        projectId,
        name,
        datasetId,
        promptId,
        promptVersion: parseInt(promptVersion, 10),
        providerId,
        model,
        evaluatorIds,
        concurrency: parseInt(concurrency, 10),
      });
      router.push(`/eval/jobs/${job.id}?projectId=${encodeURIComponent(projectId)}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="oat-page">
      <div className="mb-6">
        <Link
          href={`/eval/jobs?projectId=${encodeURIComponent(projectId)}`}
          className="oat-link-quiet inline-flex items-center gap-1"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回任务列表
        </Link>
      </div>
      <div className="oat-page-header">
        <div>
          <h1 className="oat-page-title">新建评估任务</h1>
          <p className="oat-page-subtitle">配置数据集、Prompt 与评估器，发起批量评估</p>
        </div>
      </div>

      {error && <p className="text-red-600 mb-4">操作失败：{error}</p>}

      {loading ? (
        <div className="oat-card oat-card-pad text-slate-500">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            加载中...
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="oat-card oat-card-pad space-y-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="oat-label">任务名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="oat-input"
              placeholder="如：客服 Prompt v2 评估"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="oat-label">数据集</span>
            <select
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              required
              className="oat-select"
            >
              {datasets.length === 0 && <option value="">无可用数据集</option>}
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="oat-label">Prompt</span>
              <select
                value={promptId}
                onChange={(e) => setPromptId(e.target.value)}
                required
                className="oat-select"
              >
                {prompts.length === 0 && <option value="">无可用 Prompt</option>}
                {prompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            {versions.length > 0 && (
              <label className="flex flex-col gap-1">
                <span className="oat-label">Prompt 版本</span>
                <select
                  value={promptVersion}
                  onChange={(e) => setPromptVersion(e.target.value)}
                  required
                  className="oat-select"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={String(v.version)}>
                      v{v.version}
                      {v.isActive ? '（当前）' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="oat-label">LLM Provider</span>
              <select
                value={providerId}
                onChange={(e) => handleProviderChange(e.target.value)}
                required
                className="oat-select"
              >
                {providers.length === 0 && <option value="">无可用 Provider</option>}
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="oat-label">模型</span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
                className="oat-input font-data"
                placeholder="如：gpt-4o-mini"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <span className="oat-label">评估器（可多选）</span>
            <div className="space-y-2">
              {evaluators.length === 0 && (
                <span className="text-slate-400">无可用评估器</span>
              )}
              {evaluators.map((ev) => (
                <label
                  key={ev.id}
                  className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={evaluatorIds.includes(ev.id)}
                    onChange={() => toggleEvaluator(ev.id)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-medium">{ev.name}</span>
                  <span className="text-xs text-slate-400">{ev.type}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="oat-label">并发数</span>
            <input
              type="number"
              min={1}
              max={32}
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
              required
              className="oat-input w-32"
            />
          </label>

          <div>
            <button
              type="submit"
              disabled={submitting}
              className="oat-btn oat-btn-primary"
            >
              {submitting ? '提交中...' : '创建任务'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
