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
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6">
        <Link
          href={`/eval/jobs?projectId=${encodeURIComponent(projectId)}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 返回任务列表
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-6">新建评估任务</h1>

      {error && <p className="text-red-600 mb-4">操作失败：{error}</p>}

      {loading ? (
        <p className="text-gray-500">加载中...</p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border bg-gray-50 p-4 space-y-3 text-sm"
        >
          <label className="flex flex-col gap-1">
            <span className="text-gray-600">任务名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="px-2 py-1 border rounded bg-white"
              placeholder="如：客服 Prompt v2 评估"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-gray-600">数据集</span>
            <select
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              required
              className="px-2 py-1 border rounded bg-white"
            >
              {datasets.length === 0 && <option value="">无可用数据集</option>}
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-gray-600">Prompt</span>
            <select
              value={promptId}
              onChange={(e) => setPromptId(e.target.value)}
              required
              className="px-2 py-1 border rounded bg-white"
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
              <span className="text-gray-600">Prompt 版本</span>
              <select
                value={promptVersion}
                onChange={(e) => setPromptVersion(e.target.value)}
                required
                className="px-2 py-1 border rounded bg-white"
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

          <label className="flex flex-col gap-1">
            <span className="text-gray-600">LLM Provider</span>
            <select
              value={providerId}
              onChange={(e) => handleProviderChange(e.target.value)}
              required
              className="px-2 py-1 border rounded bg-white"
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
            <span className="text-gray-600">模型</span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
              className="px-2 py-1 border rounded bg-white font-mono"
              placeholder="如：gpt-4o-mini"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-gray-600">评估器（可多选）</span>
            <div className="space-y-1">
              {evaluators.length === 0 && (
                <span className="text-gray-400">无可用评估器</span>
              )}
              {evaluators.map((ev) => (
                <label key={ev.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={evaluatorIds.includes(ev.id)}
                    onChange={() => toggleEvaluator(ev.id)}
                  />
                  <span>{ev.name}</span>
                  <span className="text-xs text-gray-400">{ev.type}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-gray-600">并发数</span>
            <input
              type="number"
              min={1}
              max={32}
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
              required
              className="px-2 py-1 border rounded bg-white w-32"
            />
          </label>

          <div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? '提交中...' : '创建任务'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
