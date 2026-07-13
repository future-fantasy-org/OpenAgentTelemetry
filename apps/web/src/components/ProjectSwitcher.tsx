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
    <select
      value={current}
      onChange={onChange}
      className="border rounded px-2 py-1 text-sm bg-white"
      aria-label="切换项目"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
