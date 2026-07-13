import { ProvidersClient } from './ProvidersClient';

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  return <ProvidersClient sp={resolved} />;
}
