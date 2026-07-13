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
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">LLM Provider 管理</h1>
      </div>

      {error && <p className="text-red-600 mb-4">操作失败：{error}</p>}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Providers</h2>
          <button
            onClick={() => {
              if (showForm) resetForm();
              setShowForm((v) => !v);
            }}
            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            {showForm ? '取消' : '新建 Provider'}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border bg-gray-50 p-4 mb-4 grid grid-cols-2 gap-3 text-sm"
          >
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-gray-600">名称</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="px-2 py-1 border rounded bg-white"
                placeholder="如：生产 OpenAI"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">类型</span>
              <select
                value={providerType}
                onChange={(e) => setProviderType(e.target.value as 'openai' | 'custom' | 'ollama')}
                className="px-2 py-1 border rounded bg-white"
              >
                {PROVIDER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">默认模型（可选）</span>
              <input
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="px-2 py-1 border rounded bg-white"
                placeholder="如：gpt-4o"
              />
            </label>
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-gray-600">Base URL</span>
              <input
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
                required
                className="px-2 py-1 border rounded bg-white"
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-gray-600">
                API Key{editingId ? '（留空则不修改）' : ''}
              </span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required={!editingId}
                className="px-2 py-1 border rounded bg-white"
                placeholder="sk-..."
              />
            </label>
            <div className="col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? '提交中...' : editingId ? '保存' : '创建'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-gray-500">加载中...</p>
        ) : providers.length === 0 ? (
          <p className="text-gray-400 py-4">暂无 Provider，点击「新建 Provider」创建</p>
        ) : (
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">名称</th>
                  <th className="text-left px-4 py-2">类型</th>
                  <th className="text-left px-4 py-2">Base URL</th>
                  <th className="text-left px-4 py-2">API Key</th>
                  <th className="text-left px-4 py-2">默认模型</th>
                  <th className="text-left px-4 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2 text-gray-600">{p.provider}</td>
                    <td className="px-4 py-2 text-gray-600 font-mono text-xs">{p.baseURL}</td>
                    <td className="px-4 py-2 text-gray-600 font-mono">{p.apiKeyPreview}</td>
                    <td className="px-4 py-2 text-gray-600">{p.defaultModel ?? '-'}</td>
                    <td className="px-4 py-2 flex gap-2">
                      <button
                        onClick={() => handleEdit(p)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleTest(p.id)}
                        className="text-xs text-purple-600 hover:underline"
                      >
                        测试
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        删除
                      </button>
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
