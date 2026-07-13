import { pgTable, uuid, text, timestamp, jsonb, integer, numeric, pgEnum, uniqueIndex, boolean } from 'drizzle-orm/pg-core';

// 枚举：观测点类型
export const observationTypeEnum = pgEnum('observation_type', ['span', 'event', 'generation']);
export const observationLevelEnum = pgEnum('observation_level', ['debug', 'info', 'warning', 'error']);

// 枚举：评分来源
export const scoreSourceEnum = pgEnum('score_source', ['user', 'api', 'eval_job']);

// projects：数据隔离边界
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  apiKeyPreview: text('api_key_preview').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// traces：调用链的根
export const traces = pgTable('traces', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  userId: text('user_id'),
  sessionId: text('session_id'),
  input: jsonb('input'),
  output: jsonb('output'),
  metadata: jsonb('metadata'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
});

// observations：树上的节点（核心表）
export const observations = pgTable('observations', {
  id: uuid('id').primaryKey().defaultRandom(),
  traceId: uuid('trace_id').notNull().references(() => traces.id),
  parentId: uuid('parent_id'),
  type: observationTypeEnum('type').notNull(),
  name: text('name').notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  input: jsonb('input'),
  output: jsonb('output'),
  model: text('model'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalCost: numeric('total_cost', { precision: 12, scale: 6 }),
  level: observationLevelEnum('level'),
  metadata: jsonb('metadata'),
});

// scores：评估打分（可对 trace 或 observation 打分）
export const scores = pgTable('scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  traceId: uuid('trace_id').references(() => traces.id),
  observationId: uuid('observation_id'),
  name: text('name').notNull(),
  value: numeric('value', { precision: 12, scale: 6 }).notNull(),
  comment: text('comment'),
  source: scoreSourceEnum('source').default('api').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// datasets：测试集
export const datasets = pgTable('datasets', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// dataset_items：测试样例
export const datasetItems = pgTable('dataset_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  datasetId: uuid('dataset_id').notNull().references(() => datasets.id),
  input: jsonb('input').notNull(),
  expectedOutput: jsonb('expected_output'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// prompts：逻辑提示词（一个 prompt 对应多个版本）
export const prompts = pgTable('prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// prompt_versions：提示词的具体内容版本
// 拆两张表：一个 prompt 多版本，运行时按 name + label 拉取当前生产版本，历史版本保留用于回滚/对比
export const promptVersions = pgTable('prompt_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptId: uuid('prompt_id').notNull().references(() => prompts.id),
  version: integer('version').notNull(),
  template: text('template').notNull(),
  config: jsonb('config'),
  labels: text('labels').array(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  promptVersionIdx: uniqueIndex('prompt_versions_prompt_id_version_idx').on(t.promptId, t.version),
}));

// users：单管理员认证。M6 只一张表，未来多用户时再加 organization/members 等
// role 字段预留：当前只有 admin，未来可扩展 viewer 等
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').default('admin').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// alert_rules：告警规则定义。metric 决定怎么算，operator+threshold 决定何时触发
// window_seconds 是滑动窗口长度；webhook_url 为空时只记录事件不发通知
export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  metric: text('metric').notNull(),
  operator: text('operator').notNull().default('gt'),
  threshold: numeric('threshold').notNull(),
  windowSeconds: integer('window_seconds').notNull().default(300),
  webhookUrl: text('webhook_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// alert_events：每次规则触发的记录。notification_status 跟踪 webhook 投递结果
export const alertEvents = pgTable('alert_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: uuid('rule_id').notNull().references(() => alertRules.id),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  metricValue: numeric('metric_value').notNull(),
  threshold: numeric('threshold').notNull(),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  notificationStatus: text('notification_status').notNull().default('pending'),
});

// audit_logs：M11 审计日志。onResponse 钩子捕获所有写操作和错误，派生 action 后落盘
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  actorEmail: text('actor_email'),
  actorIp: text('actor_ip'),
  action: text('action').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  projectId: uuid('project_id'),
  statusCode: integer('status_code').notNull(),
  durationMs: integer('duration_ms'),
  metadata: jsonb('metadata').default({}),
});
