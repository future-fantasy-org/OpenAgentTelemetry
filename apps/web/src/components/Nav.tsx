'use client';

import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProjectSwitcher } from './ProjectSwitcher';
import { logout } from '@/lib/api.client';
import type { ProjectListItem, AuthUser } from '@/lib/api';

function navHref(base: string, projectId: string | null) {
  return projectId ? `${base}?projectId=${projectId}` : base;
}

type IconProps = { className?: string };

function IconTraces({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </svg>
  );
}
function IconDashboard({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}
function IconDataset({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}
function IconPrompt({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16v10H8l-4 4V5z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}
function IconBell({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function IconAudit({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}
function IconProvider({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01" />
    </svg>
  );
}
function IconEvaluator({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function IconJob({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}
function IconLogout({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
function IconChevron({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

type NavItem = {
  href: string;
  label: string;
  Icon: (p: IconProps) => JSX.Element;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: '可观测性',
    items: [
      { href: '/', label: '调用链', Icon: IconTraces },
      { href: '/dashboard', label: '仪表盘', Icon: IconDashboard },
    ],
  },
  {
    title: '资产管理',
    items: [
      { href: '/datasets', label: '数据集', Icon: IconDataset },
      { href: '/prompts', label: '提示词', Icon: IconPrompt },
    ],
  },
  {
    title: '评估',
    items: [
      { href: '/eval/jobs', label: '评估任务', Icon: IconJob },
      { href: '/eval/evaluators', label: '评估器', Icon: IconEvaluator },
      { href: '/eval/providers', label: '模型供应商', Icon: IconProvider },
    ],
  },
  {
    title: '运维',
    items: [
      { href: '/alerts', label: '告警', Icon: IconBell },
      { href: '/audit', label: '审计日志', Icon: IconAudit },
    ],
  },
];

const EXPANDED_WIDTH = 256; // w-64
const COLLAPSED_WIDTH = 72;  // w-[72px]
const STORAGE_KEY = 'oat-sidebar-collapsed';

// Prefix-based active matching so detail/sub pages highlight their parent
function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
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

  const [collapsed, setCollapsed] = useState(false);

  // 从 localStorage 读取初始折叠状态
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '1') setCollapsed(true);
    } catch {}
  }, []);

  // 折叠状态变化时：持久化 + 同步 body 的 padding（内容区避让侧边栏）
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {}
    const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
    document.body.style.setProperty('--oat-sidebar-w', `${width}px`);
  }, [collapsed]);

  async function onLogout() {
    try {
      await logout();
    } catch {}
    router.push('/login');
    router.refresh();
  }

  const widthClass = collapsed ? 'w-[72px]' : 'w-64';

  return (
    <aside
      className={`oat-sidebar-surface oat-sidebar-transition fixed inset-y-0 left-0 z-30 flex flex-col text-slate-300 ${widthClass}`}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-4" style={{ borderBottom: '1px solid var(--oat-sidebar-border)' }}>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-lg"
          style={{ background: 'linear-gradient(135deg, #818cf8, #4f46e5)' }}
        >
          O
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-white">OpenAgent</div>
            <div className="text-[11px] text-slate-500">Telemetry</div>
          </div>
        )}
      </div>

      {/* Project switcher */}
      {!collapsed && (
        <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--oat-sidebar-border)' }}>
          <ProjectSwitcher projects={projects} />
        </div>
      )}
      {collapsed && (
        <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--oat-sidebar-border)' }}>
          <div
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg"
            title={projects.find((p) => p.id === projectId)?.name ?? '切换项目'}
            style={{ background: 'var(--oat-sidebar-surface)', border: '1px solid var(--oat-sidebar-border)' }}
          >
            <svg className="h-4 w-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
        </div>
      )}

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-5">
            {!collapsed && (
              <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {group.title}
              </div>
            )}
            {collapsed && <div className="mx-auto mb-2 h-px w-6 bg-slate-700/60" />}
            <div className="space-y-0.5">
              {group.items.map(({ href, label, Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={navHref(href, projectId)}
                    title={collapsed ? label : undefined}
                    className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all ${
                      collapsed ? 'justify-center' : ''
                    } ${
                      active
                        ? 'font-medium text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                    }`}
                    style={active ? { background: 'linear-gradient(90deg, rgba(79,70,229,0.35), rgba(79,70,229,0.15))' } : undefined}
                  >
                    {active && <span className="oat-nav-active-bar" />}
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-indigo-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid var(--oat-sidebar-border)' }}>
        <div className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-xs font-semibold text-slate-200">
            {user.email.slice(0, 2).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-medium text-slate-200">{user.email}</div>
              <div className="text-[11px] text-slate-500">已登录</div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={onLogout}
              title="登出"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
            >
              <IconLogout className="h-4 w-4" />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={onLogout}
            title="登出"
            className="mt-1 flex h-8 w-full items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
          >
            <IconLogout className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Collapse toggle button — floats at the right edge */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        className="oat-sidebar-transition absolute top-[68px] -right-3 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition-all hover:text-indigo-600 hover:shadow-lg"
      >
        <IconChevron className={`h-3.5 w-3.5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
      </button>
    </aside>
  );
}
