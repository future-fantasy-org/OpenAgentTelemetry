import { db, schema } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { aesGcmEncrypt, aesGcmDecrypt } from '../modules/crypto.js';

export type ProviderRow = {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  apiKeyPreview: string;
  defaultModel: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface IProviderRepository {
  create(data: { name: string; provider: string; baseURL: string; apiKey: string; defaultModel?: string }): Promise<ProviderRow>;
  list(): Promise<ProviderRow[]>;
  getWithKey(id: string): Promise<(ProviderRow & { apiKey: string }) | null>;
  get(id: string): Promise<ProviderRow | null>;
  update(id: string, patch: { name?: string; baseURL?: string; apiKey?: string; defaultModel?: string }): Promise<ProviderRow | null>;
  delete(id: string): Promise<void>;
}

function maskKey(key: string): string {
  return key.length <= 4 ? '****' : `****${key.slice(-4)}`;
}

function toRow(r: typeof schema.llmProviders.$inferSelect): ProviderRow {
  return {
    id: r.id, name: r.name, provider: r.provider, baseURL: r.baseURL,
    apiKeyPreview: r.apiKeyPreview, defaultModel: r.defaultModel,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export class PostgresProviderRepository implements IProviderRepository {
  async create(data: { name: string; provider: string; baseURL: string; apiKey: string; defaultModel?: string }): Promise<ProviderRow> {
    const [row] = await db.insert(schema.llmProviders).values({
      name: data.name, provider: data.provider, baseURL: data.baseURL,
      apiKeyEnc: aesGcmEncrypt(data.apiKey), apiKeyPreview: maskKey(data.apiKey),
      defaultModel: data.defaultModel ?? null,
    }).returning();
    return toRow(row);
  }

  async list(): Promise<ProviderRow[]> {
    const rows = await db.select().from(schema.llmProviders).orderBy(schema.llmProviders.createdAt);
    return rows.map(toRow);
  }

  async getWithKey(id: string): Promise<(ProviderRow & { apiKey: string }) | null> {
    const [row] = await db.select().from(schema.llmProviders).where(eq(schema.llmProviders.id, id)).limit(1);
    if (!row) return null;
    return { ...toRow(row), apiKey: aesGcmDecrypt(row.apiKeyEnc) };
  }

  async get(id: string): Promise<ProviderRow | null> {
    const [row] = await db.select().from(schema.llmProviders).where(eq(schema.llmProviders.id, id)).limit(1);
    return row ? toRow(row) : null;
  }

  async update(id: string, patch: { name?: string; baseURL?: string; apiKey?: string; defaultModel?: string }): Promise<ProviderRow | null> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.baseURL !== undefined) updates.baseURL = patch.baseURL;
    if (patch.defaultModel !== undefined) updates.defaultModel = patch.defaultModel;
    if (patch.apiKey !== undefined) {
      updates.apiKeyEnc = aesGcmEncrypt(patch.apiKey);
      updates.apiKeyPreview = maskKey(patch.apiKey);
    }
    const [row] = await db.update(schema.llmProviders).set(updates).where(eq(schema.llmProviders.id, id)).returning();
    return row ? toRow(row) : null;
  }

  async delete(id: string): Promise<void> {
    await db.delete(schema.llmProviders).where(eq(schema.llmProviders.id, id));
  }
}
