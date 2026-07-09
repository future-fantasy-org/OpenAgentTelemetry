import { db, schema } from '../db/client.js';
import { eq, desc, and, sql } from 'drizzle-orm';

export interface IPromptRepository {
  createPrompt(projectId: string, name: string, description: string | null, template: string, config: Record<string, unknown> | null): Promise<{ promptId: string; version: number }>;
  listPrompts(projectId: string): Promise<PromptListItem[]>;
  getPrompt(id: string): Promise<PromptDetail | null>;
  getPromptByName(projectId: string, name: string): Promise<PromptDetail | null>;
  addVersion(promptId: string, template: string, config: Record<string, unknown> | null, labels?: string[]): Promise<number>;
  listVersions(promptId: string): Promise<PromptVersion[]>;
}

export type PromptListItem = {
  id: string;
  name: string;
  description: string | null;
  latestVersion: number | null;
  updatedAt: Date;
};

export type PromptVersion = {
  id: string;
  version: number;
  template: string;
  config: unknown;
  labels: string[] | null;
  isActive: boolean;
  createdAt: Date;
};

export type PromptDetail = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class PostgresPromptRepository implements IPromptRepository {
  // 创建 prompt + 第一个版本（v1），原子操作
  async createPrompt(
    projectId: string,
    name: string,
    description: string | null,
    template: string,
    config: Record<string, unknown> | null,
  ): Promise<{ promptId: string; version: number }> {
    return db.transaction(async (tx) => {
      const [prompt] = await tx
        .insert(schema.prompts)
        .values({ projectId, name, description })
        .returning({ id: schema.prompts.id });

      const [ver] = await tx
        .insert(schema.promptVersions)
        .values({
          promptId: prompt.id,
          version: 1,
          template,
          config,
          labels: ['latest'],
          isActive: true,
        })
        .returning({ version: schema.promptVersions.version });

      return { promptId: prompt.id, version: ver.version };
    });
  }

  async listPrompts(projectId: string): Promise<PromptListItem[]> {
    // 用子查询拿每个 prompt 的最大版本号（列表页显示当前版本）
    // 注意：子查询里的外层列引用必须用「表名.列名」的裸 SQL，否则 drizzle 的 sql`...`
    // 模板只会渲染成裸列名 "id"，在子查询里会错误地解析到内表的 id，导致永远匹配不到、返回 null
    const rows = await db
      .select({
        id: schema.prompts.id,
        name: schema.prompts.name,
        description: schema.prompts.description,
        updatedAt: schema.prompts.updatedAt,
        latestVersion: sql<number | null>`(SELECT max(version) FROM prompt_versions WHERE prompt_id = prompts.id)`,
      })
      .from(schema.prompts)
      .where(eq(schema.prompts.projectId, projectId))
      .orderBy(desc(schema.prompts.updatedAt));

    return rows;
  }

  async getPrompt(id: string): Promise<PromptDetail | null> {
    const [row] = await db
      .select({
        id: schema.prompts.id,
        projectId: schema.prompts.projectId,
        name: schema.prompts.name,
        description: schema.prompts.description,
        createdAt: schema.prompts.createdAt,
        updatedAt: schema.prompts.updatedAt,
      })
      .from(schema.prompts)
      .where(eq(schema.prompts.id, id))
      .limit(1);
    return row ?? null;
  }

  async getPromptByName(projectId: string, name: string): Promise<PromptDetail | null> {
    const [row] = await db
      .select({
        id: schema.prompts.id,
        projectId: schema.prompts.projectId,
        name: schema.prompts.name,
        description: schema.prompts.description,
        createdAt: schema.prompts.createdAt,
        updatedAt: schema.prompts.updatedAt,
      })
      .from(schema.prompts)
      .where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.name, name)))
      .limit(1);
    return row ?? null;
  }

  // 添加新版本：自动算 version = max + 1，把旧版本标记为非 active
  async addVersion(promptId: string, template: string, config: Record<string, unknown> | null, labels?: string[]): Promise<number> {
    return db.transaction(async (tx) => {
      // 先把所有旧版本的 active 置 false（新版本成为 active）
      await tx
        .update(schema.promptVersions)
        .set({ isActive: false })
        .where(eq(schema.promptVersions.promptId, promptId));

      // 算新版本号
      const [maxRow] = await tx
        .select({ maxVer: sql<number>`coalesce(max(${schema.promptVersions.version}), 0)` })
        .from(schema.promptVersions)
        .where(eq(schema.promptVersions.promptId, promptId));
      const newVersion = (maxRow?.maxVer ?? 0) + 1;

      const [ver] = await tx
        .insert(schema.promptVersions)
        .values({
          promptId,
          version: newVersion,
          template,
          config,
          labels: labels ?? ['latest'],
          isActive: true,
        })
        .returning({ version: schema.promptVersions.version });

      // 更新父表 updatedAt
      await tx
        .update(schema.prompts)
        .set({ updatedAt: new Date() })
        .where(eq(schema.prompts.id, promptId));

      return ver.version;
    });
  }

  async listVersions(promptId: string): Promise<PromptVersion[]> {
    return db
      .select({
        id: schema.promptVersions.id,
        version: schema.promptVersions.version,
        template: schema.promptVersions.template,
        config: schema.promptVersions.config,
        labels: schema.promptVersions.labels,
        isActive: schema.promptVersions.isActive,
        createdAt: schema.promptVersions.createdAt,
      })
      .from(schema.promptVersions)
      .where(eq(schema.promptVersions.promptId, promptId))
      .orderBy(desc(schema.promptVersions.version));
  }
}
