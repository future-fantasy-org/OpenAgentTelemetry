'use client';

import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { ProjectSwitcher } from './ProjectSwitcher';
import { logout } from '@/lib/api.client';
import type { ProjectListItem, AuthUser } from '@/lib/api';

function navHref(base: string, projectId: string | null) {
  return projectId ? `${base}?projectId=${projectId}` : base;
}

export function Nav({
  projects,
  user,
}: {
  projects: ProjectListItem[];
  user: AuthUser;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId');

  async function onLogout() {
    try {
      await logout();
    } catch {}
    router.push('/login');
    router.refresh();
  }

  const links: { href: string; label: string }[] = [
    { href: '/', label: 'Traces' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/datasets', label: '数据集' },
    { href: '/prompts', label: 'Prompts' },
    { href: '/alerts', label: '告警' },
    { href: '/audit', label: '审计' },
  ];

  return (
    <nav className="border-b bg-white">
      <div className="mx-auto max-w-7xl flex items-center gap-4 px-6 h-14">
        <Link href={navHref('/', projectId)} className="font-bold text-gray-900">
          OAT
        </Link>
        <ProjectSwitcher projects={projects} />
        <div className="flex items-center gap-1 ml-2">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={navHref(l.href, projectId)}
                className={`px-3 py-1.5 rounded text-sm ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-500">{user.email}</span>
          <button
            onClick={onLogout}
            className="text-sm px-3 py-1 rounded border hover:bg-gray-50"
          >
            登出
          </button>
        </div>
      </div>
    </nav>
  );
}
