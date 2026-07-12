import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { IAlertRepository } from '../repositories/alert-repository.js';
import type { AlertEvaluator } from '../modules/alert-evaluator.js';

// 规则创建校验：metric/operator 枚举对齐 evaluator 支持的集合
// windowSeconds 限制 60s~1d：太短会放大抖动，太长失去告警时效性
const createRuleSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  metric: z.enum(['error_rate', 'p99_latency', 'cost_rate', 'trace_rate']),
  operator: z.enum(['gt', 'gte', 'lt', 'lte']).default('gt'),
  threshold: z.number(),
  windowSeconds: z.number().int().min(60).max(86_400).default(300),
  webhookUrl: z.string().url().optional(),
});

// 更新用 partial；额外允许 enabled（开关规则时只改这一个字段）
const updateRuleSchema = createRuleSchema.partial().extend({
  enabled: z.boolean().optional(),
});

// 闭包工厂：deps 走闭包捕获，规避 Fastify 插件 options 泛型限制（与其它路由一致）
export function buildAlertRoutes(deps: {
  alertRepo: IAlertRepository;
  alertEvaluator: AlertEvaluator;
}): FastifyPluginAsync {
  return async (app) => {
    // GET /api/alerts/rules?projectId=xxx — 列出项目下的告警规则
    app.get('/api/alerts/rules', async (req, reply) => {
      const { projectId } = req.query as { projectId?: string };
      if (!projectId) {
        return reply
          .status(400)
          .send({ error: { code: 'BAD_REQUEST', message: '缺少 projectId' } });
      }
      const rules = await deps.alertRepo.listRules(projectId);
      return { rules };
    });

    // POST /api/alerts/rules — 创建规则
    app.post('/api/alerts/rules', async (req, reply) => {
      const parsed = createRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      const rule = await deps.alertRepo.createRule(parsed.data);
      return reply.status(201).send(rule);
    });

    // GET /api/alerts/rules/:id — 规则详情
    app.get('/api/alerts/rules/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const rule = await deps.alertRepo.getRule(id);
      if (!rule) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '规则不存在' } });
      }
      return rule;
    });

    // PUT /api/alerts/rules/:id — 更新规则（部分字段）
    app.put('/api/alerts/rules/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }
      const rule = await deps.alertRepo.updateRule(id, parsed.data);
      if (!rule) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '规则不存在' } });
      }
      return rule;
    });

    // DELETE /api/alerts/rules/:id — 删除规则（连带事件因外键 ON DELETE 无动作需先手动清理或加级联）
    app.delete('/api/alerts/rules/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      await deps.alertRepo.deleteRule(id);
      return reply.status(204).send();
    });

    // GET /api/alerts/events?projectId=xxx&limit=50 — 触发事件时间线
    app.get('/api/alerts/events', async (req, reply) => {
      const { projectId, limit } = req.query as { projectId?: string; limit?: string };
      if (!projectId) {
        return reply
          .status(400)
          .send({ error: { code: 'BAD_REQUEST', message: '缺少 projectId' } });
      }
      const events = await deps.alertRepo.listEvents(projectId, parseInt(limit ?? '50', 10));
      return { events };
    });

    // POST /api/alerts/rules/:id/test — 手动测试 webhook 投递
    app.post('/api/alerts/rules/:id/test', async (req, reply) => {
      const { id } = req.params as { id: string };
      const rule = await deps.alertRepo.getRule(id);
      if (!rule) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '规则不存在' } });
      }
      const ok = await deps.alertEvaluator.testWebhook(rule);
      return { ok };
    });
  };
}
