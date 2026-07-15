'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api.client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next') || '/';
      router.push(next);
      router.refresh();
    } catch {
      setError('邮箱或密码错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen">
      {/* Branded panel */}
      <div
        className="hidden w-1/2 flex-col justify-between p-12 text-white lg:flex"
        style={{ background: 'linear-gradient(160deg, #0b1020 0%, #141b2e 55%, #1e1b4b 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold shadow-lg"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
          >
            O
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold">OpenAgent</div>
            <div className="text-xs text-slate-400">Telemetry</div>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            AI Agent 可观测性平台
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            全链路 Trace 追踪、评估实验、告警监控与成本分析。让每一次 LLM 调用都清晰可见、可度量、可优化。
          </p>
          <div className="mt-8 space-y-3">
            {[
              '实时 Trace 瀑布图与延迟分位',
              '自动化评估与 LLM-as-Judge',
              '成本、Token 与模型用量洞察',
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-2.5 text-sm text-slate-300">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                {feat}
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-500">© {new Date().getFullYear()} OpenAgentTelemetry</div>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center bg-slate-50 px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">欢迎回来</h2>
            <p className="mt-1.5 text-sm text-slate-500">登录以进入控制台</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="oat-label">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="oat-input"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="oat-label">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="oat-input"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="oat-btn oat-btn-primary w-full py-2.5"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
