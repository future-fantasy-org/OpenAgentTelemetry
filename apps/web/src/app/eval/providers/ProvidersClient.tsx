'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  testProvider,
  type LlmProvider,
} from '@/lib/api.client';

const PROVIDER_TYPES: Array<'openai' | 'custom' | 'ollama'> = ['openai', 'custom', 'ollama'];

export function ProvidersClient({ sp }: { sp: { projectId?: string } }) {
  const projectId = sp.projectId ?? '';
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState<'openai' | 'custom' | 'ollama'>('openai');
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listProviders();
      setProviders(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setProviderType('openai');
    setBaseURL('');
    setApiKey('');
    setDefaultModel('');
  }

  function handleEdit(p: LlmProvider) {
    setEditingId(p.id);
    setName(p.name);
    setProviderType(p.provider);
    setBaseURL(p.baseURL);
    setApiKey('');
    setDefaultModel(p.defaultModel ?? '');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        const patch: Record<string, unknown> = {
          name,
          provider: providerType,
          baseURL,
          defaultModel: defaultModel || undefined,
        };
        if (apiKey) patch.apiKey = apiKey;
        await updateProvider(editingId, patch);
      } else {
        await createProvider({
          name,
          provider: providerType,
          baseURL,
          apiKey,
          defaultModel: defaultModel || undefined,
        });
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
    if (!confirm('确定删除这个 Provider？')) return;
    try {
      await deleteProvider(id);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleTest(id: string) {
    try {
      const result = await testProvider(id);
      alert(result.ok ? `测试成功${result.message ? '：' + result.message : ''}` : '测试失败');
    } catch (err) {
      alert('测试失败：' + (err as Error).message);
    }
  }

  return (
    <main className="oat-page">
      <header className="oat-page-header">
        <div>
          <h1 className="oat-page-title">LLM Provider 管理</h1>
          <p className="oat-page-subtitle">模型供应商连接与密钥配置</p>
        </div>
      </header>

      {error && (
        <div className="oat-card oat-card-pad mb-6 border-rose-200 bg-rose-50">
          <p className="text-sm text-rose-700">操作失败：{error}</p>
        </div>
      )}

      <section>
        <div className="oat-page-header mb-4">
          <h2 className="oat-page-title text-lg">Providers</h2>
          <button
            onClick={() => {
              if (showForm) resetForm();
              setShowForm((v) => !v);
            }}
            className="oat-btn oat-btn-primary oat-btn-sm"
          >
            {showForm ? '取消' : '新建 Provider'}
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
                placeholder="如：生产 OpenAI"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="oat-label">类型</span>
              <select
                value={providerType}
                onChange={(e) => setProviderType(e.target.value as 'openai' | 'custom' | 'ollama')}
                className="oat-select"
              >
                {PROVIDER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="oat-label">默认模型（可选）</span>
              <input
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="oat-input"
                placeholder="如：gpt-4o"
              />
            </label>
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="oat-label">Base URL</span>
              <input
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
                required
                className="oat-input"
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="oat-label">
                API Key{editingId ? '（留空则不修改）' : ''}
              </span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required={!editingId}
                className="oat-input"
                placeholder="sk-..."
              />
            </label>
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
        ) : providers.length === 0 ? (
          <div className="oat-card oat-card-pad text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">暂无 Provider，点击「新建 Provider」创建</p>
          </div>
        ) : (
          <div className="oat-card overflow-hidden">
            <table className="oat-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>Base URL</th>
                  <th>API Key</th>
                  <th>默认模型</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-slate-900">{p.name}</td>
                    <td>
                      <span className="oat-badge oat-badge-neutral">{p.provider}</span>
                    </td>
                    <td className="font-data text-xs text-slate-600">{p.baseURL}</td>
                    <td className="font-data text-xs text-slate-600">{p.apiKeyPreview}</td>
                    <td className="text-slate-600">{p.defaultModel ?? '-'}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleEdit(p)}
                          className="oat-link text-xs"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleTest(p.id)}
                          className="text-violet-600 hover:underline text-xs"
                        >
                          测试
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
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
