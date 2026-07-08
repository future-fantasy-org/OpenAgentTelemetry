import { z } from 'zod';

// 观测点类型：span=有时长步骤；event=瞬时事件；generation=LLM 调用
export const observationTypeSchema = z.enum(['span', 'event', 'generation']);

// 单个观测点的运行时校验（SDK 上报的数据形态多变，必须校验）
export const observationSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  parentId: z.string().nullable().default(null),
  type: observationTypeSchema,
  name: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  input: z.any().optional(),
  output: z.any().optional(),
  model: z.string().optional(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalCost: z.number().nonnegative().optional(),
  level: z.enum(['debug', 'info', 'warning', 'error']).optional(),
  metadata: z.record(z.unknown()).optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
});

// 批量上报请求
export const ingestionBatchSchema = z.object({
  batch: z.array(observationSchema).min(1),
});

// 从 schema 反向推导出 TS 类型（schema 与类型永不漂移）
export type Observation = z.infer<typeof observationSchema>;
export type IngestionBatchRequest = z.infer<typeof ingestionBatchSchema>;
