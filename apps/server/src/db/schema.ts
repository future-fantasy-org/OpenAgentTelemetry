import { pgTable, uuid, text, timestamp, jsonb, integer, numeric, pgEnum } from 'drizzle-orm/pg-core';

// 枚举：观测点类型
export const observationTypeEnum = pgEnum('observation_type', ['span', 'event', 'generation']);
export const observationLevelEnum = pgEnum('observation_level', ['debug', 'info', 'warning', 'error']);

// projects：数据隔离边界
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  apiKey: text('api_key').notNull().unique(),
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
