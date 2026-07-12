'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getStatsOverview, type StatsOverview } from '@/lib/api';

const RANGES = [
  { key: '1h', label: '1 小时' },
  { key: '24h', label: '24 小时' },
  { key: '7d', label: '7 天' },
  { key: '30d', label: '30 天' },
];

function fmtBucket(b: string, range: string) {
  const d = new Date(b);
  if (range === '1h' || range === '24h') {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export default function DashboardClient({ projectId, initialRange }: { projectId: string; initialRange: string }) {
  const [range, setRange] = useState(initialRange);
  const [data, setData] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStatsOverview(projectId, range)
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, projectId]);

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="text-blue-600 hover:underline">Traces</Link>
          <Link href="/datasets" className="text-blue-600 hover:underline">数据集</Link>
          <Link href="/prompts" className="text-blue-600 hover:underline">Prompt</Link>
          <Link href="/alerts" className="text-blue-600 hover:underline">告警</Link>
        </nav>
      </div>

      <div className="flex gap-2 mb-6">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`px-3 py-1 text-sm rounded ${
              range === r.key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-500">加载中...</p>}
      {error && <p className="text-red-600 mb-4">加载失败：{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="总 Traces" value={String(data.summary.totalTraces)} />
            <SummaryCard label="总 Token" value={data.summary.totalTokens.toLocaleString()} />
            <SummaryCard label="总成本" value={`$${Number(data.summary.totalCost).toFixed(4)}`} />
            <SummaryCard label="平均延迟" value={data.summary.avgLatencyMs ? `${data.summary.avgLatencyMs} ms` : '-'} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChartCard title="调用量趋势">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.series.map((s) => ({ ...s, label: fmtBucket(s.bucket, range) }))}>
                  <defs>
                    <linearGradient id="gradCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="traceCount" stroke="#3b82f6" fill="url(#gradCount)" name="Trace 数" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="延迟分位 (ms)">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.series.map((s) => ({
                  label: fmtBucket(s.bucket, range),
                  p50: s.p50LatencyMs, p90: s.p90LatencyMs, p99: s.p99LatencyMs,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="p50" stroke="#10b981" dot={false} />
                  <Line type="monotone" dataKey="p90" stroke="#f59e0b" dot={false} />
                  <Line type="monotone" dataKey="p99" stroke="#ef4444" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Token 用量">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.series.map((s) => ({
                  label: fmtBucket(s.bucket, range),
                  prompt: s.promptTokens, completion: s.completionTokens,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="prompt" stackId="a" fill="#8b5cf6" name="prompt" />
                  <Bar dataKey="completion" stackId="a" fill="#ec4899" name="completion" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="成本趋势 ($)">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.series.map((s) => ({ label: fmtBucket(s.bucket, range), cost: Number(s.totalCost) }))}>
                  <defs>
                    <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Area type="monotone" dataKey="cost" stroke="#f97316" fill="url(#gradCost)" name="成本" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="评分分布">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="avgValue" fill="#6366f1" name="平均分" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 模型 (调用量)">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart layout="vertical" data={data.topModels}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="model" fontSize={11} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#14b8a6" name="调用数" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
      {children}
    </div>
  );
}
