import type { FastifyPluginAsync } from 'fastify';
import type { IPromptRepository } from '../repositories/prompt-repository.js';

// 变量插值：把 {{name}} 替换成 variables.name 的值
// 支持 {{name}} 和 {{name:default}} 两种语法
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)(?::([^}]+))?\}\}/g, (_, key: string, defaultVal?: string) => {
    if (key in variables) return variables[key];
    if (defaultVal !== undefined) return defaultVal;
    return `{{${key}}}`;
  });
}

// 提取模板里的所有变量名（前端用于生成输入表单）
export function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)(?::([^}]+))?\}\}/g);
  const names = new Set<string>();
  for (const m of matches) {
    names.add(m[1]);
  }
  return [...names];
}

export function buildPromptRoutes(promptRepo: IPromptRepository): FastifyPluginAsync {
  return async (app) => {
    // GET /api/prompts?projectId=xxx — 列出项目的 prompts
    app.get('/api/prompts', async (req) => {
      const { projectId } = req.query as { projectId: string };
      if (!projectId) return { prompts: [] };
      const prompts = await promptRepo.listPrompts(projectId);
      return { prompts };
    });

    // GET /api/prompts/:id — prompt 详情 + 所有版本
    app.get('/api/prompts/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const prompt = await promptRepo.getPrompt(id);
      if (!prompt) return reply.status(404).send({ error: 'Prompt 不存在' });
      const versions = await promptRepo.listVersions(id);
      return { prompt, versions };
    });

    // POST /api/prompts — 创建 prompt（含 v1 版本）
    app.post('/api/prompts', async (req) => {
      const { projectId, name, description, template, config } = req.body as {
        projectId: string;
        name: string;
        description?: string;
        template: string;
        config?: Record<string, unknown>;
      };
      const result = await promptRepo.createPrompt(projectId, name, description ?? null, template, config ?? null);
      return result;
    });

    // POST /api/prompts/:id/versions — 添加新版本
    app.post('/api/prompts/:id/versions', async (req) => {
      const { id } = req.params as { id: string };
      const { template, config, labels } = req.body as {
        template: string;
        config?: Record<string, unknown>;
        labels?: string[];
      };
      const version = await promptRepo.addVersion(id, template, config ?? null, labels);
      return { version };
    });

    // POST /api/prompts/:id/render — 变量插值渲染（预览效果）
    app.post('/api/prompts/:id/render', async (req, reply) => {
      const { id } = req.params as { id: string };
      const { variables } = req.body as { variables: Record<string, string> };
      const prompt = await promptRepo.getPrompt(id);
      if (!prompt) return reply.status(404).send({ error: 'Prompt 不存在' });
      const versions = await promptRepo.listVersions(id);
      const active = versions.find((v) => v.isActive) ?? versions[0];
      if (!active) return reply.status(404).send({ error: '没有可用版本' });

      const rendered = renderTemplate(active.template, variables ?? {});
      return { rendered, version: active.version };
    });

    // GET /api/prompts/:id/variables — 提取模板变量（前端生成表单用）
    app.get('/api/prompts/:id/variables', async (req, reply) => {
      const { id } = req.params as { id: string };
      const prompt = await promptRepo.getPrompt(id);
      if (!prompt) return reply.status(404).send({ error: 'Prompt 不存在' });
      const versions = await promptRepo.listVersions(id);
      const active = versions.find((v) => v.isActive) ?? versions[0];
      if (!active) return reply.status(404).send({ error: '没有可用版本' });

      return { variables: extractVariables(active.template) };
    });
  };
}
