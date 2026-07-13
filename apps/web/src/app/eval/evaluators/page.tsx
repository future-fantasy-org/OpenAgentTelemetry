import { EvaluatorsClient } from './EvaluatorsClient';

export default async function EvaluatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const resolved = await searchParams;
  return <EvaluatorsClient sp={resolved} />;
}
