import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-bold mb-2">404</h1>
      <p className="text-sm text-gray-500 mb-6">页面不存在。</p>
      <Link href="/" className="text-blue-600 hover:underline text-sm">
        返回首页
      </Link>
    </main>
  );
}
