import { JobsClient } from './JobsClient';

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  return <JobsClient sp={resolved} />;
}
