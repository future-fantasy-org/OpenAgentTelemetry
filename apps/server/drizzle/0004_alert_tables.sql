-- M8: 告警系统 — alert_rules（规则定义）+ alert_events（触发历史）
-- ingestion 完成后非阻塞触发 AlertEvaluator，SQL 滑动窗口算指标，超阈值记事件 + 发 Webhook
CREATE TABLE alert_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id),
  name            TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  metric          TEXT NOT NULL,
  operator        TEXT NOT NULL DEFAULT 'gt',
  threshold       NUMERIC NOT NULL,
  window_seconds  INTEGER NOT NULL DEFAULT 300,
  webhook_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE alert_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id             UUID NOT NULL REFERENCES alert_rules(id),
  project_id          UUID NOT NULL REFERENCES projects(id),
  metric_value        NUMERIC NOT NULL,
  threshold           NUMERIC NOT NULL,
  triggered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ,
  notification_status TEXT NOT NULL DEFAULT 'pending'
);

-- 部分索引：只索引启用的规则，listRules 走 project_id 过滤时更快
CREATE INDEX idx_alert_rules_project ON alert_rules(project_id) WHERE enabled = true;
-- 事件查询按 rule + 时间倒序
CREATE INDEX idx_alert_events_rule ON alert_events(rule_id, triggered_at DESC);
