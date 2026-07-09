import { db, schema } from '../db/client.js';
import { eq, desc } from 'drizzle-orm';

export interface IDatasetRepository {
  createDataset(projectId: string, name: string, description?: string): Promise<string>;
  listDatasets(projectId: string): Promise<DatasetItem[]>;
  getDataset(id: string): Promise<DatasetDetail | null>;
  addDatasetItem(datasetId: string, input: unknown, expectedOutput?: unknown): Promise<string>;
  listDatasetItems(datasetId: string): Promise<DatasetRow[]>;
}

export type DatasetItem = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
};

export type DatasetDetail = DatasetItem & {
  projectId: string;
};

export type DatasetRow = {
  id: string;
  input: unknown;
  expectedOutput: unknown;
  createdAt: Date;
};

export class PostgresDatasetRepository implements IDatasetRepository {
  async createDataset(projectId: string, name: string, description?: string): Promise<string> {
    const [inserted] = await db
      .insert(schema.datasets)
      .values({ projectId, name, description: description ?? null })
      .returning({ id: schema.datasets.id });
    return inserted.id;
  }

  async listDatasets(projectId: string): Promise<DatasetItem[]> {
    return db
      .select({
        id: schema.datasets.id,
        name: schema.datasets.name,
        description: schema.datasets.description,
        createdAt: schema.datasets.createdAt,
      })
      .from(schema.datasets)
      .where(eq(schema.datasets.projectId, projectId))
      .orderBy(desc(schema.datasets.createdAt));
  }

  async getDataset(id: string): Promise<DatasetDetail | null> {
    const [row] = await db
      .select({
        id: schema.datasets.id,
        projectId: schema.datasets.projectId,
        name: schema.datasets.name,
        description: schema.datasets.description,
        createdAt: schema.datasets.createdAt,
      })
      .from(schema.datasets)
      .where(eq(schema.datasets.id, id))
      .limit(1);
    return row ?? null;
  }

  async addDatasetItem(datasetId: string, input: unknown, expectedOutput?: unknown): Promise<string> {
    const [inserted] = await db
      .insert(schema.datasetItems)
      .values({ datasetId, input, expectedOutput: expectedOutput ?? null })
      .returning({ id: schema.datasetItems.id });
    return inserted.id;
  }

  async listDatasetItems(datasetId: string): Promise<DatasetRow[]> {
    const rows = await db
      .select({
        id: schema.datasetItems.id,
        input: schema.datasetItems.input,
        expectedOutput: schema.datasetItems.expectedOutput,
        createdAt: schema.datasetItems.createdAt,
      })
      .from(schema.datasetItems)
      .where(eq(schema.datasetItems.datasetId, datasetId))
      .orderBy(desc(schema.datasetItems.createdAt));
    return rows;
  }
}
