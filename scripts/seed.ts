import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { projects } from '../apps/server/src/db/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '../apps/server/drizzle');

const url = process.env.DATABASE_URL!;
const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

async function main() {
  await migrate(db, { migrationsFolder });

  const [proj] = await db
    .insert(projects)
    .values({ name: 'Demo Project', slug: 'demo', apiKey: 'demo-api-key' })
    .onConflictDoUpdate({ target: projects.slug, set: { name: 'Demo Project' } })
    .returning();

  console.log(JSON.stringify({ projectId: proj.id, apiKey: proj.apiKey }));
  await sql.end();
}

main();
