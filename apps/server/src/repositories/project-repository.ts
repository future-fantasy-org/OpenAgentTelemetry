import { db, schema } from '../db/client.js';
import { eq, desc } from 'drizzle-orm';
import { hashApiKey } from '../modules/api-key.js';

export type ProjectListItem = {
  id: string;
  name: string;
  apiKeyPreview: string;
  createdAt: Date;
};

export interface IProjectRepository {
  findByApiKey(rawApiKey: string): Promise<{ id: string; name: string } | null>;
  listAll(): Promise<ProjectListItem[]>;
  exists(projectId: string): Promise<boolean>;
}

export class PostgresProjectRepository implements IProjectRepository {
  async findByApiKey(rawApiKey: string) {
    const hash = hashApiKey(rawApiKey);
    const [row] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(eq(schema.projects.apiKeyHash, hash));
    return row ?? null;
  }

  async listAll(): Promise<ProjectListItem[]> {
    return db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        apiKeyPreview: schema.projects.apiKeyPreview,
        createdAt: schema.projects.createdAt,
      })
      .from(schema.projects)
      .orderBy(desc(schema.projects.createdAt));
  }

  async exists(projectId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);
    return !!row;
  }
}
