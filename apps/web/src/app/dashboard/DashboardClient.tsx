'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getStatsOverview, type StatsOverview } from '@/lib/api.client';

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

const CHART_GRID = { stroke: '#e2e8f0', strokeDasharray: '3 3', vertical: false };

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
    <main className="oat-page-wide">
      <div className="oat-page-header">
        <div>
          <h1 className="oat-page-title">Dashboard</h1>
          <p className="oat-page-subtitle">关键指标趋势与模型用量洞察</p>
        </div>
        {/* Segmented range control */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                range === r.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="oat-card-pad flex items-center gap-2 text-slate-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          加载中...
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          加载失败：{error}
        </div>
      )}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard label="总 Traces" value={String(data.summary.totalTraces)} accent="indigo" />
            <SummaryCard label="总 Token" value={data.summary.totalTokens.toLocaleString()} accent="violet" />
            <SummaryCard label="总成本" value={`$${Number(data.summary.totalCost).toFixed(4)}`} accent="amber" />
            <SummaryCard label="平均延迟" value={data.summary.avgLatencyMs ? `${data.summary.avgLatencyMs} ms` : '-'} accent="emerald" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChartCard title="调用量趋势">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.series.map((s) => ({ ...s, label: fmtBucket(s.bucket, range) }))}>
                  <defs>
                    <linearGradient id="gradCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <YAxis fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <Tooltip />
                  <Area type="monotone" dataKey="traceCount" stroke="#6366f1" strokeWidth={2} fill="url(#gradCount)" name="Trace 数" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="延迟分位 (ms)">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.series.map((s) => ({
                  label: fmtBucket(s.bucket, range),
                  p50: s.p50LatencyMs, p90: s.p90LatencyMs, p99: s.p99LatencyMs,
                }))}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="p90" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="p99" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Token 用量">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.series.map((s) => ({
                  label: fmtBucket(s.bucket, range),
                  prompt: s.promptTokens, completion: s.completionTokens,
                }))}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="prompt" stackId="a" fill="#8b5cf6" name="prompt" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="completion" stackId="a" fill="#ec4899" name="completion" radius={[3, 3, 0, 0]} />
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
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <Tooltip />
                  <Area type="monotone" dataKey="cost" stroke="#f97316" strokeWidth={2} fill="url(#gradCost)" name="成本" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="评分分布">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.scoreDistribution}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="avgValue" fill="#6366f1" name="平均分" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 模型 (调用量)">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart layout="vertical" data={data.topModels}>
                  <CartesianGrid {...CHART_GRID} horizontal={false} />
                  <XAxis type="number" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="model" fontSize={11} width={120} tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="count" fill="#14b8a6" name="调用数" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </main>
  );
}

const ACCENT_BAR: Record<string, string> = {
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
};

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="oat-card-pad oat-card-hover">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-6 rounded-full ${ACCENT_BAR[accent]}`} />
        <span className="oat-kpi-label">{label}</span>
      </div>
      <div className="oat-kpi-value">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="oat-card-pad">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  );
}
