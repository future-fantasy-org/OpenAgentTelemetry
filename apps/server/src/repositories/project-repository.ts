import { db, schema } from '../db/client.js';
import { eq, desc } from 'drizzle-orm';

export type ProjectListItem = {
  id: string;
  name: string;
  apiKey: string;
  createdAt: Date;
};

export interface IProjectRepository {
  findByApiKey(apiKey: string): Promise<{ id: string; name: string } | null>;
  listAll(): Promise<ProjectListItem[]>;
}

export class PostgresProjectRepository implements IProjectRepository {
  async findByApiKey(apiKey: string) {
    const [row] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(eq(schema.projects.apiKey, apiKey));
    return row ?? null;
  }

  async listAll(): Promise<ProjectListItem[]> {
    return db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        apiKey: schema.projects.apiKey,
        createdAt: schema.projects.createdAt,
      })
      .from(schema.projects)
      .orderBy(desc(schema.projects.createdAt));
  }
}
