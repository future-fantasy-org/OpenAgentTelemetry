import { JobDetailClient } from './JobDetailClient';

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { id } = await params;
  const resolved = await searchParams;
  return <JobDetailClient jobId={id} sp={resolved} />;
}
