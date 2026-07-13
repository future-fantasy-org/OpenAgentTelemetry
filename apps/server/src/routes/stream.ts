import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { eventBus } from '../modules/event-bus.js';

// M12: SSE 实时推送端点
// 客户端用 EventSource（同源，依赖 oat_session cookie 鉴权）
// 心跳每 30s 一次，避免反向代理掐断空闲连接

const HEARTBEAT_MS = 30_000;

function startSSE(reply: FastifyReply, eventName: string, listener: (payload: any) => void): { cleanup: () => void } {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write(': connected\n\n');

  eventBus.on(eventName, listener);

  const heartbeat = setInterval(() => {
    try { reply.raw.write(': hb\n\n'); } catch {}
  }, HEARTBEAT_MS);

  return {
    cleanup: () => {
      clearInterval(heartbeat);
      eventBus.off(eventName, listener);
    },
  };
}

export const buildStreamRoutes: FastifyPluginAsync = async (app) => {
  // Traces 实时流（按 projectId 过滤）
  app.get('/api/stream/traces', {
    config: { rateLimit: false },
  }, async (req, reply) => {
    const projectId = (req.query as { projectId?: string }).projectId;
    const listener = (payload: { projectId: string; trace: unknown }) => {
      if (projectId && payload.projectId !== projectId) return;
      try {
        reply.raw.write(`event: trace:created\ndata: ${JSON.stringify(payload.trace)}\n\n`);
      } catch {}
    };
    const { cleanup } = startSSE(reply, 'trace:created', listener);
    req.raw.on('close', cleanup);
  });

  // Alert Events 实时流（按 projectId 过滤）
  app.get('/api/stream/alert-events', {
    config: { rateLimit: false },
  }, async (req, reply) => {
    const projectId = (req.query as { projectId?: string }).projectId;
    const listener = (payload: { projectId: string; event: unknown }) => {
      if (projectId && payload.projectId !== projectId) return;
      try {
        reply.raw.write(`event: alert:triggered\ndata: ${JSON.stringify(payload.event)}\n\n`);
      } catch {}
    };
    const { cleanup } = startSSE(reply, 'alert:triggered', listener);
    req.raw.on('close', cleanup);
  });

  // Audit logs 实时流（全局，无 projectId 过滤）
  app.get('/api/stream/audit-logs', {
    config: { rateLimit: false },
  }, async (_req, reply) => {
    const listener = (payload: { log: unknown }) => {
      try {
        reply.raw.write(`event: audit:logged\ndata: ${JSON.stringify(payload.log)}\n\n`);
      } catch {}
    };
    const { cleanup } = startSSE(reply, 'audit:logged', listener);
    _req.raw.on('close', cleanup);
  });

  // M13: Eval 任务进度流（按 jobId 过滤）
  // 客户端监听 item-completed 和 job-completed 两个事件
  app.get('/api/stream/eval/:jobId', {
    config: { rateLimit: false },
  }, async (req, reply) => {
    const jobId = (req.params as { jobId: string }).jobId;

    const itemListener = (payload: { jobId: string; itemId: string; status: string }) => {
      if (payload.jobId !== jobId) return;
      try {
        reply.raw.write(`event: eval:item-completed\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch {}
    };
    const jobListener = (payload: { jobId: string; projectId: string; status: string }) => {
      if (payload.jobId !== jobId) return;
      try {
        reply.raw.write(`event: eval:job-completed\ndata: ${JSON.stringify(payload)}\n\n`);
        reply.raw.end();
      } catch {}
    };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    eventBus.on('eval:item-completed', itemListener);
    eventBus.on('eval:job-completed', jobListener);

    const heartbeat = setInterval(() => {
      try { reply.raw.write(': hb\n\n'); } catch {}
    }, HEARTBEAT_MS);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      eventBus.off('eval:item-completed', itemListener);
      eventBus.off('eval:job-completed', jobListener);
    });
  });
};
