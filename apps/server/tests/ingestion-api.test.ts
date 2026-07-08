import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { ITraceRepository, IProjectRepository, TraceListItem } from '../src/repositories/index.js';

// 内存 mock：记录被调用的数据，方便断言
function makeMockRepos(listReturn: TraceListItem[] = []) {
  const stored: Array<{ trace: unknown; obs: unknown[] }> = [];
  const traceRepo: ITraceRepository = {
    async listTraces() { return listReturn; },
    async createTraceWithObservations(trace, obs) { stored.push({ trace, obs }); },
  };
  const projectRepo: IProjectRepository = {
    async findByApiKey(key: string) {
      return key === 'valid-key' ? { id: 'proj-1', name: 'test' } : null;
    },
  };
  return { traceRepo, projectRepo, stored };
}

describe('Ingestion API', () => {
  let app: FastifyInstance;
  let mocks: ReturnType<typeof makeMockRepos>;

  beforeEach(async () => {
    mocks = makeMockRepos();
    app = await buildApp(mocks);
  });

  it('缺少 API Key 返回 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/public/ingestion', payload: { batch: [] } });
    expect(res.statusCode).toBe(401);
  });

  it('无效 API Key 返回 401', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/public/ingestion',
      headers: { authorization: 'Bearer wrong' },
      payload: { batch: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('合法请求写入并返回 202', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/public/ingestion',
      headers: { authorization: 'Bearer valid-key' },
      payload: {
        batch: [
          {
            id: 'o1', traceId: 't1', parentId: null,
            type: 'span', name: 'root', startTime: '2026-07-09T00:00:00Z',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.payload).accepted).toBe(1);
    expect(mocks.stored).toHaveLength(1);
  });

  it('坏数据返回 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/public/ingestion',
      headers: { authorization: 'Bearer valid-key' },
      payload: { batch: [{ id: 'x' }] }, // 缺 traceId
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Traces 查询 API', () => {
  it('返回项目下的 trace 列表', async () => {
    const listTraceReturn: TraceListItem[] = [
      { id: 't1', name: 'trace1', userId: null, sessionId: null, timestamp: new Date() },
    ];
    const traceRepo: ITraceRepository = {
      async listTraces() { return listTraceReturn; },
      async createTraceWithObservations() {},
    };
    const projectRepo: IProjectRepository = {
      async findByApiKey(k: string) { return k === 'valid-key' ? { id: 'proj-1', name: 't' } : null; },
    };
    const app = await buildApp({ traceRepo, projectRepo });

    const res = await app.inject({ method: 'GET', url: '/api/traces?projectId=00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.traces).toHaveLength(1);
    expect(body.traces[0].name).toBe('trace1');
  });
});
