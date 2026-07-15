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
  sent: 'oat-badge-green',
  failed: 'oat-badge-red',
  skipped: 'oat-badge-neutral',
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
    <main className="oat-page">
      <header className="oat-page-header">
        <div>
          <h1 className="oat-page-title">告警</h1>
          <p className="oat-page-subtitle">监控关键指标阈值并接收实时通知</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
          <span className={`oat-dot ${sseConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          {sseConnected ? '实时已连接' : '未连接'}
        </div>
      </header>

      {error && (
        <div className="oat-card oat-card-pad mb-6 border-rose-200 bg-rose-50">
          <p className="text-sm text-rose-700">操作失败：{error}</p>
        </div>
      )}

      <section className="mb-8">
        <div className="oat-page-header mb-4">
          <h2 className="oat-page-title text-lg">规则</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="oat-btn oat-btn-primary oat-btn-sm"
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
          <p className="oat-page-subtitle">加载中...</p>
        ) : rules.length === 0 ? (
          <div className="oat-card oat-card-pad">
            <p className="text-sm text-slate-500">暂无规则，点击「新建规则」创建一条</p>
          </div>
        ) : (
          <div className="oat-card overflow-hidden">
            <table className="oat-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>指标</th>
                  <th>阈值</th>
                  <th>窗口</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="font-medium text-slate-900">{rule.name}</td>
                    <td className="text-slate-600">
                      {METRICS.find((m) => m.key === rule.metric)?.label ?? rule.metric}
                    </td>
                    <td className="font-data text-slate-600">
                      {OPERATORS.find((o) => o.key === rule.operator)?.label ?? rule.operator} {rule.threshold}
                    </td>
                    <td className="text-slate-600">{rule.windowSeconds}s</td>
                    <td>
                      <span className={`oat-badge ${rule.enabled ? 'oat-badge-green' : 'oat-badge-neutral'}`}>
                        {rule.enabled ? '启用' : '停用'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggle(rule)}
                          className="oat-btn oat-btn-sm oat-btn-ghost"
                        >
                          {rule.enabled ? '停用' : '启用'}
                        </button>
                        {rule.webhookUrl && (
                          <button
                            onClick={() => handleTest(rule.id)}
                            className="oat-link text-xs"
                          >
                            测试
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="oat-link text-xs text-rose-600 hover:text-rose-700"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="oat-page-title text-lg mb-4">触发事件</h2>
        {events.length === 0 ? (
          <div className="oat-card oat-card-pad">
            <p className="text-sm text-slate-500">暂无触发记录</p>
          </div>
        ) : (
          <div className="oat-card overflow-hidden">
            <table className="oat-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>规则</th>
                  <th>实测值</th>
                  <th>阈值</th>
                  <th>通知</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const rule = rules.find((r) => r.id === ev.ruleId);
                  return (
                    <tr key={ev.id}>
                      <td className="text-slate-500">
                        {new Date(ev.triggeredAt).toLocaleString()}
                      </td>
                      <td className="text-slate-900">{rule?.name ?? ev.ruleId.slice(0, 8)}</td>
                      <td className="font-data text-slate-700">{ev.metricValue}</td>
                      <td className="font-data text-slate-700">{ev.threshold}</td>
                      <td>
                        <span className={`oat-badge ${NOTIF_COLORS[ev.notificationStatus] ?? 'oat-badge-neutral'}`}>
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
    <form onSubmit={handleSubmit} className="oat-card oat-card-pad mb-4 grid grid-cols-2 gap-4">
      <label className="flex flex-col gap-1.5 col-span-2">
        <span className="oat-label">规则名称</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="oat-input"
          placeholder="如：错误率告警"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="oat-label">指标</span>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="oat-select"
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="oat-label">比较运算符</span>
        <select
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          className="oat-select"
        >
          {OPERATORS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="oat-label">阈值</span>
        <input
          type="number"
          step="any"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          required
          className="oat-input"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="oat-label">窗口（秒，60~86400）</span>
        <input
          type="number"
          min={60}
          max={86400}
          value={windowSeconds}
          onChange={(e) => setWindowSeconds(e.target.value)}
          required
          className="oat-input"
        />
      </label>
      <label className="flex flex-col gap-1.5 col-span-2">
        <span className="oat-label">Webhook URL（可选，留空则只记录事件）</span>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          className="oat-input"
          placeholder="https://hooks.slack.com/..."
        />
      </label>
      <div className="col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="oat-btn oat-btn-primary oat-btn-sm disabled:opacity-50"
        >
          {submitting ? '提交中...' : '创建'}
        </button>
      </div>
    </form>
  );
}
