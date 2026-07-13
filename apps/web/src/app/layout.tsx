import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { getMe, listProjects } from '@/lib/api.server';

export const metadata: Metadata = { title: 'OpenAgentTelemetry' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  const search = h.get('x-search') ?? '';
  const sp = new URLSearchParams(search);
  const projectIdFromUrl = sp.get('projectId');

  const me = await getMe().catch(() => null);

  let navProjects: Awaited<ReturnType<typeof listProjects>>['projects'] = [];
  if (me) {
    const { projects } = await listProjects().catch(() => ({ projects: [] as never }));
    navProjects = projects;
    if (projects.length > 0 && !projectIdFromUrl) {
      const fallback = new URLSearchParams(search);
      fallback.set('projectId', projects[0].id);
      redirect(`/?${fallback.toString()}`);
    }
  }

  return (
    <html lang="zh">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {me && navProjects.length > 0 && (
          <Nav projects={navProjects} user={me.user} />
        )}
        {children}
      </body>
    </html>
  );
}
