import { NewJobClient } from './NewJobClient';

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  return <NewJobClient sp={resolved} />;
}
