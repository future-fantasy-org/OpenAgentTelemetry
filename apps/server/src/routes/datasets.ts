import type { FastifyPluginAsync } from 'fastify';
import type { IDatasetRepository } from '../repositories/dataset-repository.js';

export function buildDatasetRoutes(datasetRepo: IDatasetRepository): FastifyPluginAsync {
  return async (app) => {
    // GET /api/datasets?projectId=xxx — 列出项目的数据集
    app.get('/api/datasets', async (req) => {
      const { projectId } = req.query as { projectId: string };
      if (!projectId) return { datasets: [] };
      const datasets = await datasetRepo.listDatasets(projectId);
      return { datasets };
    });

    // GET /api/datasets/:id — 数据集详情
    app.get('/api/datasets/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const dataset = await datasetRepo.getDataset(id);
      if (!dataset) return reply.status(404).send({ error: '数据集不存在' });
      const items = await datasetRepo.listDatasetItems(id);
      return { dataset, items };
    });

    // POST /api/datasets — 创建数据集
    app.post('/api/datasets', async (req) => {
      const { projectId, name, description } = req.body as {
        projectId: string;
        name: string;
        description?: string;
      };
      const id = await datasetRepo.createDataset(projectId, name, description);
      return { id };
    });

    // POST /api/datasets/:id/items — 给数据集添加测试样例
    app.post('/api/datasets/:id/items', async (req) => {
      const { id } = req.params as { id: string };
      const { input, expectedOutput } = req.body as {
        input: unknown;
        expectedOutput?: unknown;
      };
      const itemId = await datasetRepo.addDatasetItem(id, input, expectedOutput);
      return { id: itemId };
    });
  };
}
