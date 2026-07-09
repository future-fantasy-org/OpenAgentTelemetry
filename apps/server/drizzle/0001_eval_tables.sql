-- 0001: M2+M3 新增 scores / datasets / dataset_items 表

CREATE TYPE "score_source" AS ENUM ('user', 'api', 'eval_job');--> statement-breakpoint

CREATE TABLE "scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "trace_id" uuid REFERENCES "traces"("id"),
  "observation_id" uuid,
  "name" text NOT NULL,
  "value" numeric(12, 6) NOT NULL,
  "comment" text,
  "source" "score_source" DEFAULT 'api' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "datasets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "dataset_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dataset_id" uuid NOT NULL REFERENCES "datasets"("id"),
  "input" jsonb NOT NULL,
  "expected_output" jsonb,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX "scores_trace_id_idx" ON "scores" ("trace_id");--> statement-breakpoint
CREATE INDEX "scores_project_id_idx" ON "scores" ("project_id");--> statement-breakpoint
CREATE INDEX "datasets_project_id_idx" ON "datasets" ("project_id");--> statement-breakpoint
CREATE INDEX "dataset_items_dataset_id_idx" ON "dataset_items" ("dataset_id");
