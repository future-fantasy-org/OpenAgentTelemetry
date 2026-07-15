'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listEvaluators,
  createEvaluator,
  updateEvaluator,
  deleteEvaluator,
  listProviders,
  type Evaluator,
  type LlmProvider,
} from '@/lib/api.client';
import type {
  EvaluatorType,
  LlmJudgeConfig,
  NumericThresholdConfig,
} from '@/lib/api.shared';

const METRICS = [
  { key: 'latency_ms', label: '延迟 (ms)' },
  { key: 'prompt_tokens', label: 'Prompt Tokens' },
  { key: 'completion_tokens', label: 'Completion Tokens' },
  { key: 'total_cost', label: '总花费 ($)' },
];

const OPERATORS = [
  { key: 'lt', label: '<' },
  { key: 'lte', label: '≤' },
  { key: 'gt', label: '>' },
  { key: 'gte', label: '≥' },
];

function configSummary(ev: Evaluator): string {
  if (ev.type === 'numeric_threshold') {
    const c = ev.config as NumericThresholdConfig;
    const op = OPERATORS.find((o) => o.key === c.operator)?.label ?? c.operator;
    return `${c.metric} ${op} ${c.threshold}`;
  }
  const c = ev.config as LlmJudgeConfig;
  return `${c.model} ${c.min}-${c.max}`;
}

export function EvaluatorsClient({ sp }: { sp: { projectId?: string } }) {
  const projectId = sp.projectId ?? '';
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<EvaluatorType>('numeric_threshold');
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [judgePrompt, setJudgePrompt] = useState('');
  const [min, setMin] = useState('0');
  const [max, setMax] = useState('1');
  const [metric, setMetric] = useState<NumericThresholdConfig['metric']>('latency_ms');
  const [operator, setOperator] = useState<NumericThresholdConfig['operator']>('lte');
  const [threshold, setThreshold] = useState('2000');
  const [passScore, setPassScore] = useState('1');
  const [failScore, setFailScore] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [evs, provs] = await Promise.all([
        listEvaluators(projectId),
        listProviders(),
      ]);
      setEvaluators(evs);
      setProviders(provs);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setType('numeric_threshold');
    setProviderId('');
    setModel('');
    setJudgePrompt('');
    setMin('0');
    setMax('1');
    setMetric('latency_ms');
    setOperator('lte');
    setThreshold('2000');
    setPassScore('1');
    setFailScore('0');
  }

  function handleEdit(ev: Evaluator) {
    setEditingId(ev.id);
    setName(ev.name);
    setType(ev.type);
    if (ev.type === 'llm_judge') {
      const c = ev.config as LlmJudgeConfig;
      setProviderId(c.providerId);
      setModel(c.model);
      setJudgePrompt(c.judgePrompt);
      setMin(String(c.min));
      setMax(String(c.max));
    } else {
      const c = ev.config as NumericThresholdConfig;
      setMetric(c.metric);
      setOperator(c.operator);
      setThreshold(String(c.threshold));
      setPassScore(String(c.passScore));
      setFailScore(String(c.failScore));
    }
    setShowForm(true);
  }

  function buildConfig(): LlmJudgeConfig | NumericThresholdConfig {
    if (type === 'llm_judge') {
      return {
        providerId,
        model,
        judgePrompt,
        min: parseFloat(min),
        max: parseFloat(max),
      };
    }
    return {
      metric,
      operator,
      threshold: parseFloat(threshold),
      passScore: parseFloat(passScore),
      failScore: parseFloat(failScore),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const config = buildConfig();
      if (editingId) {
        await updateEvaluator(editingId, { name, type, config });
      } else {
        await createEvaluator({ projectId, name, type, config });
      }
      resetForm();
      setShowForm(false);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除这个评估器？')) return;
    try {
      await deleteEvaluator(id);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="oat-page">
      <header className="oat-page-header">
        <div>
          <h1 className="oat-page-title">评估器管理</h1>
          <p className="oat-page-subtitle">配置数值阈值与 LLM-as-Judge 评估规则</p>
        </div>
      </header>

      {error && (
        <div className="oat-card oat-card-pad mb-6 border-rose-200 bg-rose-50">
          <p className="text-sm text-rose-700">操作失败：{error}</p>
        </div>
      )}

      <section>
        <div className="oat-page-header mb-4">
          <h2 className="oat-page-title text-lg">评估器</h2>
          <button
            onClick={() => {
              if (showForm) resetForm();
              setShowForm((v) => !v);
            }}
            className="oat-btn oat-btn-primary oat-btn-sm"
          >
            {showForm ? '取消' : '新建评估器'}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="oat-card oat-card-pad mb-4 grid grid-cols-2 gap-4"
          >
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="oat-label">名称</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="oat-input"
                placeholder="如：延迟阈值评估"
              />
            </label>
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="oat-label">类型</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as EvaluatorType)}
                className="oat-select"
              >
                <option value="numeric_threshold">数值阈值 (numeric_threshold)</option>
                <option value="llm_judge">LLM 评判 (llm_judge)</option>
              </select>
            </label>

            {type === 'llm_judge' ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="oat-label">Provider</span>
                  <select
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value)}
                    required
                    className="oat-select"
                  >
                    <option value="">请选择</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="oat-label">模型</span>
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    required
                    className="oat-input"
                    placeholder="如：gpt-4o"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="oat-label">最小分</span>
                  <input
                    type="number"
                    step="any"
                    value={min}
                    onChange={(e) => setMin(e.target.value)}
                    required
                    className="oat-input"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="oat-label">最大分</span>
                  <input
                    type="number"
                    step="any"
                    value={max}
                    onChange={(e) => setMax(e.target.value)}
                    required
                    className="oat-input"
                  />
                </label>
                <label className="flex flex-col gap-1.5 col-span-2">
                  <span className="oat-label">评判 Prompt</span>
                  <textarea
                    value={judgePrompt}
                    onChange={(e) => setJudgePrompt(e.target.value)}
                    required
                    rows={4}
                    className="oat-textarea"
                    placeholder="请根据以下标准对回答打分..."
                  />
                </label>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="oat-label">指标</span>
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as NumericThresholdConfig['metric'])}
                    className="oat-select"
                  >
                    {METRICS.map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="oat-label">运算符</span>
                  <select
                    value={operator}
                    onChange={(e) => setOperator(e.target.value as NumericThresholdConfig['operator'])}
                    className="oat-select"
                  >
                    {OPERATORS.map((o) => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="oat-label">阈值</span>
                  <input
                    type="number"
                    step="any"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    required
                    className="oat-input"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="oat-label">通过分 (passScore)</span>
                  <input
                    type="number"
                    step="any"
                    value={passScore}
                    onChange={(e) => setPassScore(e.target.value)}
                    required
                    className="oat-input"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="oat-label">失败分 (failScore)</span>
                  <input
                    type="number"
                    step="any"
                    value={failScore}
                    onChange={(e) => setFailScore(e.target.value)}
                    required
                    className="oat-input"
                  />
                </label>
              </>
            )}

            <div className="col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="oat-btn oat-btn-primary disabled:opacity-50"
              >
                {submitting ? '提交中...' : editingId ? '保存' : '创建'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="oat-page-subtitle">加载中...</p>
        ) : evaluators.length === 0 ? (
          <div className="oat-card oat-card-pad text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">暂无评估器，点击「新建评估器」创建</p>
          </div>
        ) : (
          <div className="oat-card overflow-hidden">
            <table className="oat-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>配置</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {evaluators.map((ev) => (
                  <tr key={ev.id}>
                    <td className="font-medium text-slate-900">{ev.name}</td>
                    <td>
                      <span className="oat-badge oat-badge-neutral font-data">{ev.type}</span>
                    </td>
                    <td className="font-data text-xs text-slate-600">{configSummary(ev)}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleEdit(ev)}
                          className="oat-link text-xs"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(ev.id)}
                          className="text-rose-600 hover:underline text-xs"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
