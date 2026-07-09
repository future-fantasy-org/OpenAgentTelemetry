import DashboardClient from './DashboardClient';

const SEED_PROJECT_ID = process.env.SEED_PROJECT_ID ?? '';
const VALID_RANGES = ['1h', '24h', '7d', '30d'];

// 服务端组件：从 URL searchParams 读初始 range，传给客户端组件
// 好处：range 既出现在 URL 里（可分享、刷新保持），又有客户端交互（切换不跳转）
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = sp.range && VALID_RANGES.includes(sp.range) ? sp.range : '24h';
  return <DashboardClient projectId={SEED_PROJECT_ID} initialRange={range} />;
}
