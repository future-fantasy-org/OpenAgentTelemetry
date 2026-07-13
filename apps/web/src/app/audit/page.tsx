import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getMe } from '@/lib/api.server';
import { AuditClient } from './AuditClient';

export default async function AuditPage() {
  const me = await getMe().catch(() => null);
  if (!me) redirect('/login');

  const h = await headers();
  const search = h.get('x-search') ?? '';
  const sp = new URLSearchParams(search);
  const projectId = sp.get('projectId') ?? undefined;

  return <AuditClient projectId={projectId} />;
}
