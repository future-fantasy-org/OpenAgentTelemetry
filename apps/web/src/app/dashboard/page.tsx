import { getCurrentProjectId } from '@/lib/project-context';
import DashboardClient from './DashboardClient';

const VALID_RANGES = ['1h', '24h', '7d', '30d'];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; range?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);
  const rawRange = sp.get('range');
  const range = rawRange && VALID_RANGES.includes(rawRange) ? rawRange : '24h';
  return <DashboardClient projectId={projectId} initialRange={range} />;
}
