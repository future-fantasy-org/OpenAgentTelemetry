import AlertClient from './AlertClient';

const SEED_PROJECT_ID = process.env.SEED_PROJECT_ID ?? '';

export default function AlertsPage() {
  return <AlertClient projectId={SEED_PROJECT_ID} />;
}
