-- OpenAgentTelemetry 初始迁移：projects, traces, observations
-- 与 src/db/schema.ts 对应

-- 枚举类型
CREATE TYPE "observation_type" AS ENUM('span', 'event', 'generation');
CREATE TYPE "observation_level" AS ENUM('debug', 'info', 'warning', 'error');

-- projects：数据隔离边界
CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "api_key" text NOT NULL UNIQUE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- traces：调用链的根
CREATE TABLE IF NOT EXISTS "traces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "name" text NOT NULL,
  "user_id" text,
  "session_id" text,
  "input" jsonb,
  "output" jsonb,
  "metadata" jsonb,
  "timestamp" timestamptz DEFAULT now() NOT NULL
);

-- observations：树上的节点（核心表）
CREATE TABLE IF NOT EXISTS "observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "trace_id" uuid NOT NULL REFERENCES "traces"("id"),
  "parent_id" uuid,
  "type" "observation_type" NOT NULL,
  "name" text NOT NULL,
  "start_time" timestamptz NOT NULL,
  "end_time" timestamptz,
  "input" jsonb,
  "output" jsonb,
  "model" text,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "total_cost" numeric(12, 6),
  "level" "observation_level",
  "metadata" jsonb
);

-- 索引（性能关键）
CREATE INDEX IF NOT EXISTS "traces_project_id_timestamp_idx" ON "traces" ("project_id", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "observations_trace_id_idx" ON "observations" ("trace_id");
CREATE INDEX IF NOT EXISTS "observations_parent_id_idx" ON "observations" ("parent_id");
CREATE INDEX IF NOT EXISTS "traces_user_id_idx" ON "traces" ("user_id");
CREATE INDEX IF NOT EXISTS "traces_session_id_idx" ON "traces" ("session_id");
CREATE INDEX IF NOT EXISTS "traces_project_id_idx" ON "traces" ("project_id");
