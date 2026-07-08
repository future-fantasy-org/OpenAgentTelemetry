import { db, schema } from '../db/client.js';
import { eq } from 'drizzle-orm';

export interface IProjectRepository {
  findByApiKey(apiKey: string): Promise<{ id: string; name: string } | null>;
}

export class PostgresProjectRepository implements IProjectRepository {
  async findByApiKey(apiKey: string) {
    const [row] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(eq(schema.projects.apiKey, apiKey));
    return row ?? null;
  }
}
