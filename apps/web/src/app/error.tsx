'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isAuth = error.message === 'SESSION_EXPIRED' || error.digest?.includes('SESSION');

  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold mb-2">
        {isAuth ? '登录已过期' : '页面出错了'}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {isAuth ? '请重新登录后再试。' : error.message || '请稍后重试。'}
      </p>
      <div className="flex justify-center gap-3">
        <button
          onClick={() => {
            reset();
            router.refresh();
          }}
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          重试
        </button>
        {isAuth && (
          <a
            href="/login"
            className="px-4 py-2 rounded border text-sm hover:bg-gray-50"
          >
            去登录
          </a>
        )}
      </div>
    </main>
  );
}
