import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { projects } from '../apps/server/src/db/schema.js';
import { generateApiKey } from '../apps/server/src/modules/api-key.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '../apps/server/drizzle');

const url = process.env.DATABASE_URL!;
const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

async function main() {
  await migrate(db, { migrationsFolder });

  const { raw, hash, preview } = generateApiKey();
  const [proj] = await db
    .insert(projects)
    .values({ name: 'Demo Project', slug: 'demo', apiKeyHash: hash, apiKeyPreview: preview })
    .onConflictDoUpdate({
      target: projects.slug,
      set: { apiKeyHash: hash, apiKeyPreview: preview },
    })
    .returning();

  console.log(JSON.stringify({ projectId: proj.id, apiKey: raw }));
  await sql.end();
}

main();
