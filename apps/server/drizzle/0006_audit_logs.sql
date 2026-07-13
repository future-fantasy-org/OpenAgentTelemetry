-- M11: 审计日志表 — onResponse 钩子记录写操作和错误事件
CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_email" text,
  "actor_ip" text,
  "action" text NOT NULL,
  "method" text NOT NULL,
  "path" text NOT NULL,
  "resource_type" text,
  "resource_id" text,
  "project_id" uuid,
  "status_code" integer NOT NULL,
  "duration_ms" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX idx_audit_logs_created_at ON "audit_logs" (created_at DESC);
CREATE INDEX idx_audit_logs_project_id ON "audit_logs" (project_id);
CREATE INDEX idx_audit_logs_action ON "audit_logs" (action);
