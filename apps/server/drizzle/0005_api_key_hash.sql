-- M10: API Key 哈希化 — 删 api_key 明文列，加 api_key_hash + api_key_preview
-- 破坏性迁移：老 key 失效，重新 pnpm db:seed 拿新 key

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_api_key_key";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "api_key";
ALTER TABLE "projects" ADD COLUMN "api_key_hash" text NOT NULL;
ALTER TABLE "projects" ADD COLUMN "api_key_preview" text NOT NULL;
ALTER TABLE "projects" ADD CONSTRAINT "projects_api_key_hash_unique" UNIQUE ("api_key_hash");
