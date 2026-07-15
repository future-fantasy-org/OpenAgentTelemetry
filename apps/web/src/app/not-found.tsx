import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="oat-card-pad max-w-md text-center">
        <div className="text-5xl font-bold tracking-tight text-slate-300">404</div>
        <p className="mt-2 text-sm text-slate-500">页面不存在。</p>
        <Link href="/" className="oat-btn oat-btn-primary mt-6">
          返回首页
        </Link>
      </div>
    </main>
  );
}
