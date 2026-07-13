import { getCurrentProjectId } from '@/lib/project-context';
import { listTraces } from '@/lib/api.server';
import { TracesClient } from './TracesClient';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  const sp = new URLSearchParams(resolved as Record<string, string>);
  const { projectId } = await getCurrentProjectId(sp);
  const traces = await listTraces(projectId);

  return <TracesClient initialTraces={traces} projectId={projectId} />;
}
