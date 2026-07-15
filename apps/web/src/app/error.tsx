'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    console.error(error);
  }, [error]);

  const isAuth = error.message === 'SESSION_EXPIRED' || error.digest?.includes('SESSION');
  const isRateLimit =
    error.name === 'RateLimitError' ||
    /限流|rate.?limit|too many|过于频繁|retry in/i.test(error.message);

  // 限流时启动倒计时
  useEffect(() => {
    if (!isRateLimit) return;
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isRateLimit]);

  const icon = isAuth ? (
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  ) : isRateLimit ? (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ) : (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  );

  const accent = isAuth ? 'bg-amber-50 text-amber-500' : isRateLimit ? 'bg-indigo-50 text-indigo-500' : 'bg-rose-50 text-rose-500';

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="oat-card-pad max-w-md text-center">
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${accent}`}>
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {icon}
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-slate-900">
          {isAuth ? '登录已过期' : isRateLimit ? '请求过于频繁' : '页面出错了'}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {isAuth
            ? '请重新登录后再试。'
            : isRateLimit
              ? '服务端已触发限流保护，请稍候片刻再重试。'
              : error.message || '请稍后重试。'}
        </p>

        {isRateLimit && countdown > 0 && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            <span className="font-data tabular-nums">{countdown}s</span> 后可重试
          </div>
        )}

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => {
              reset();
              router.refresh();
            }}
            disabled={isRateLimit && countdown > 0}
            className="oat-btn oat-btn-primary disabled:opacity-50"
          >
            重试
          </button>
          {isAuth && (
            <a href="/login" className="oat-btn oat-btn-ghost">
              去登录
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
