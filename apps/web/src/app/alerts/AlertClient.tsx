'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listAlertRules,
  listAlertEvents,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  testAlertWebhook,
  type AlertRule,
  type AlertEvent,
} from '@/lib/api.client';

const METRICS = [
  { key: 'error_rate', label: '错误率 (%)' },
  { key: 'p99_latency', label: 'P99 延迟 (ms)' },
  { key: 'cost_rate', label: '花费速率 ($/min)' },
  { key: 'trace_rate', label: 'Trace 速率 (次/min)' },
];

const OPERATORS = [
  { key: 'gt', label: '>' },
  { key: 'gte', label: '>=' },
  { key: 'lt', label: '<' },
  { key: 'lte', label: '<=' },
];

const NOTIF_COLORS: Record<string, string> = {
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-600',
};

export default function AlertClient({ projectId }: { projectId: string }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [r, e] = await Promise.all([
        listAlertRules(projectId),
        listAlertEvents(projectId),
      ]);
      setRules(r);
      setEvents(e);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // M12: SSE 实时推送新告警事件
  useEffect(() => {
    const es = new EventSource(`/api/stream/alert-events?projectId=${encodeURIComponent(projectId)}`);
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.addEventListener('alert:triggered', (e: MessageEvent) => {
      try {
        const event: AlertEvent = JSON.parse(e.data);
        event.triggeredAt = typeof event.triggeredAt === 'string' ? event.triggeredAt : new Date(event.triggeredAt).toISOString();
        setEvents((prev) => {
          if (prev.some((x) => x.id === event.id && event.id)) return prev;
          return [event, ...prev].slice(0, 100);
        });
      } catch {}
    });
    return () => { es.close(); };
  }, [projectId]);

  async function handleToggle(rule: AlertRule) {
    try {
      await updateAlertRule(rule.id, { enabled: !rule.enabled });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除这条规则？')) return;
    try {
      await deleteAlertRule(id);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleTest(id: string) {
    try {
      const result = await testAlertWebhook(id);
      alert(result.ok ? 'Webhook 投递成功' : 'Webhook 投递失败');
    } catch (err) {
      alert('测试失败：' + (err as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">告警</h1>
      </div>

      {error && <p className="text-red-600 mb-4">操作失败：{error}</p>}

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">规则</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            {showForm ? '取消' : '新建规则'}
          </button>
        </div>

        {showForm && (
          <CreateRuleForm
            projectId={projectId}
            onCreated={() => {
              setShowForm(false);
              reload();
            }}
            onError={setError}
          />
        )}

        {loading ? (
          <p className="text-gray-500">加载中...</p>
        ) : rules.length === 0 ? (
          <p className="text-gray-400 py-4">暂无规则，点击「新建规则」创建一条</p>
        ) : (
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">名称</th>
                  <th className="text-left px-4 py-2">指标</th>
                  <th className="text-left px-4 py-2">阈值</th>
                  <th className="text-left px-4 py-2">窗口</th>
                  <th className="text-left px-4 py-2">状态</th>
                  <th className="text-left px-4 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{rule.name}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {METRICS.find((m) => m.key === rule.metric)?.label ?? rule.metric}
                    </td>
                    <td className="px-4 py-2 text-gray-600 font-mono">
                      {OPERATORS.find((o) => o.key === rule.operator)?.label ?? rule.operator} {rule.threshold}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{rule.windowSeconds}s</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded ${rule.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {rule.enabled ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="px-4 py-2 flex gap-2">
                      <button
                        onClick={() => handleToggle(rule)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {rule.enabled ? '停用' : '启用'}
                      </button>
                      {rule.webhookUrl && (
                        <button
                          onClick={() => handleTest(rule.id)}
                          className="text-xs text-purple-600 hover:underline"
                        >
                          测试
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">触发事件</h2>
        {events.length === 0 ? (
          <p className="text-gray-400 py-4">暂无触发记录</p>
        ) : (
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">时间</th>
                  <th className="text-left px-4 py-2">规则</th>
                  <th className="text-left px-4 py-2">实测值</th>
                  <th className="text-left px-4 py-2">阈值</th>
                  <th className="text-left px-4 py-2">通知</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const rule = rules.find((r) => r.id === ev.ruleId);
                  return (
                    <tr key={ev.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(ev.triggeredAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">{rule?.name ?? ev.ruleId.slice(0, 8)}</td>
                      <td className="px-4 py-2 font-mono">{ev.metricValue}</td>
                      <td className="px-4 py-2 font-mono">{ev.threshold}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded ${NOTIF_COLORS[ev.notificationStatus] ?? 'bg-gray-100'}`}>
                          {ev.notificationStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function CreateRuleForm({
  projectId,
  onCreated,
  onError,
}: {
  projectId: string;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('error_rate');
  const [operator, setOperator] = useState('gt');
  const [threshold, setThreshold] = useState('10');
  const [windowSeconds, setWindowSeconds] = useState('300');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createAlertRule({
        projectId,
        name,
        metric,
        operator,
        threshold: parseFloat(threshold),
        windowSeconds: parseInt(windowSeconds, 10),
        webhookUrl: webhookUrl.trim() || null,
      });
      onCreated();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-gray-50 p-4 mb-4 grid grid-cols-2 gap-3 text-sm">
      <label className="flex flex-col gap-1 col-span-2">
        <span className="text-gray-600">规则名称</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="px-2 py-1 border rounded bg-white"
          placeholder="如：错误率告警"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-gray-600">指标</span>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="px-2 py-1 border rounded bg-white"
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-gray-600">比较运算符</span>
        <select
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          className="px-2 py-1 border rounded bg-white"
        >
          {OPERATORS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-gray-600">阈值</span>
        <input
          type="number"
          step="any"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          required
          className="px-2 py-1 border rounded bg-white"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-gray-600">窗口（秒，60~86400）</span>
        <input
          type="number"
          min={60}
          max={86400}
          value={windowSeconds}
          onChange={(e) => setWindowSeconds(e.target.value)}
          required
          className="px-2 py-1 border rounded bg-white"
        />
      </label>
      <label className="flex flex-col gap-1 col-span-2">
        <span className="text-gray-600">Webhook URL（可选，留空则只记录事件）</span>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          className="px-2 py-1 border rounded bg-white"
          placeholder="https://hooks.slack.com/..."
        />
      </label>
      <div className="col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? '提交中...' : '创建'}
        </button>
      </div>
    </form>
  );
}
