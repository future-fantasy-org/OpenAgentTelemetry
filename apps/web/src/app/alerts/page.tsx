import { getCurrentProjectId } from '@/lib/project-context';
import AlertClient from './AlertClient';

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);
  return <AlertClient projectId={projectId} />;
}
