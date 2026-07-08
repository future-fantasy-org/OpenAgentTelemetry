import { describe, it, expect } from 'vitest';
import { PostgresTraceRepository, PostgresProjectRepository } from '../src/repositories/index.js';

// 这些测试需要 DATABASE_URL 指向一个可写的 Postgres
// 本地跑前先启动 docker-compose（见 Task 9）
const repo = new PostgresTraceRepository();
const projectRepo = new PostgresProjectRepository();

describe('PostgresTraceRepository（需真实 Postgres）', () => {
  it('能写入 trace 并列出', async () => {
    const project = await projectRepo.findByApiKey('demo-api-key');
    if (!project) return; // 种子数据未就绪时跳过

    await repo.createTraceWithObservations(
      { projectId: project.id, name: '测试 trace' },
      [],
    );

    const list = await repo.listTraces(project.id, 10);
    expect(list.some((t) => t.name === '测试 trace')).toBe(true);
  });
});
