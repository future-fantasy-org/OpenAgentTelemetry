-- 0002: M4 新增 prompts / prompt_versions 表

CREATE TABLE "prompts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "prompt_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "prompt_id" uuid NOT NULL REFERENCES "prompts"("id"),
  "version" integer NOT NULL,
  "template" text NOT NULL,
  "config" jsonb,
  "labels" text[],
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "prompts_project_id_name_idx" ON "prompts" ("project_id", "name");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_prompt_id_version_idx" ON "prompt_versions" ("prompt_id", "version");--> statement-breakpoint
CREATE INDEX "prompts_project_id_idx" ON "prompts" ("project_id");--> statement-breakpoint
CREATE INDEX "prompt_versions_prompt_id_idx" ON "prompt_versions" ("prompt_id");
