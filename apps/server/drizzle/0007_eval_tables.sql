CREATE TABLE IF NOT EXISTS "llm_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key_enc" text NOT NULL,
	"api_key_preview" text NOT NULL,
	"default_model" text,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "evaluators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id"),
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "eval_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id"),
	"name" text NOT NULL,
	"dataset_id" uuid NOT NULL REFERENCES "datasets"("id"),
	"prompt_id" uuid NOT NULL REFERENCES "prompts"("id"),
	"prompt_version" integer NOT NULL,
	"provider_id" uuid NOT NULL REFERENCES "llm_providers"("id"),
	"model" text NOT NULL,
	"evaluator_ids" uuid[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"concurrency" integer DEFAULT 3 NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"completed_items" integer DEFAULT 0 NOT NULL,
	"failed_items" integer DEFAULT 0 NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb,
	"error_message" text,
	"started_at" timestamptz,
	"completed_at" timestamptz,
	"created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "eval_job_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL REFERENCES "eval_jobs"("id") ON DELETE CASCADE,
	"dataset_item_id" uuid NOT NULL REFERENCES "dataset_items"("id"),
	"status" text DEFAULT 'pending' NOT NULL,
	"output" jsonb,
	"trace_id" uuid,
	"latency_ms" integer,
	"error_message" text,
	"started_at" timestamptz,
	"completed_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "evaluators_project_id_idx" ON "evaluators" ("project_id");
CREATE INDEX IF NOT EXISTS "eval_jobs_project_id_idx" ON "eval_jobs" ("project_id");
CREATE INDEX IF NOT EXISTS "eval_jobs_status_idx" ON "eval_jobs" ("status");
CREATE INDEX IF NOT EXISTS "eval_job_items_job_id_idx" ON "eval_job_items" ("job_id");
CREATE INDEX IF NOT EXISTS "eval_job_items_trace_id_idx" ON "eval_job_items" ("trace_id");
