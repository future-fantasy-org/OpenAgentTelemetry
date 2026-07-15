'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ProjectListItem } from '@/lib/api';

export function ProjectSwitcher({ projects }: { projects: ProjectListItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('projectId') ?? projects[0]?.id ?? '';

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('projectId', e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="block">
      <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
        Project
      </div>
      <div
        className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-white/5"
        style={{ background: 'var(--oat-sidebar-surface)', border: '1px solid var(--oat-sidebar-border)' }}
      >
        <svg className="h-3.5 w-3.5 shrink-0 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <select
          value={current}
          onChange={onChange}
          aria-label="切换项目"
          className="min-w-0 flex-1 cursor-pointer bg-transparent text-xs font-medium text-slate-200 focus:outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id} className="bg-slate-800 text-slate-100">
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}
