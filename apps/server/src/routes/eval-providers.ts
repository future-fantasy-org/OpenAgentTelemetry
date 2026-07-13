import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { IProviderRepository } from '../repositories/provider-repository.js';

const createSchema = z.object({
  name: z.string().min(1),
  provider: z.enum(['openai', 'custom', 'ollama']),
  baseURL: z.string().url(),
  apiKey: z.string().min(1),
  defaultModel: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  baseURL: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  defaultModel: z.string().optional(),
});

export function buildEvalProviderRoutes(deps: { providerRepo: IProviderRepository }): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/eval/providers', async () => {
      const providers = await deps.providerRepo.list();
      return { providers };
    });

    app.post('/api/eval/providers', async (req, reply) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      const provider = await deps.providerRepo.create(parsed.data);
      return reply.status(201).send(provider);
    });

    app.put('/api/eval/providers/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      const provider = await deps.providerRepo.update(id, parsed.data);
      if (!provider) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Provider 不存在' } });
      return provider;
    });

    app.delete('/api/eval/providers/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      await deps.providerRepo.delete(id);
      return reply.status(204).send();
    });

    app.post('/api/eval/providers/:id/test', async (req, reply) => {
      const { id } = req.params as { id: string };
      const provider = await deps.providerRepo.getWithKey(id);
      if (!provider) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Provider 不存在' } });
      try {
        const { chatComplete } = await import('../modules/llm-client.js');
        await chatComplete(
          { baseURL: provider.baseURL, apiKey: provider.apiKey },
          provider.defaultModel ?? 'gpt-4o-mini',
          [{ role: 'user', content: 'ping' }],
        );
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    });
  };
}
