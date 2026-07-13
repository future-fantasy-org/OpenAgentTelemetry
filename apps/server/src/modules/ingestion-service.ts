import type { ITraceRepository } from '../repositories/trace-repository.js';
import type { TraceListItem } from '../repositories/trace-repository.js';
import type { Observation } from '@oat/shared';
import { eventBus } from './event-bus.js';

// alertEvaluator 用结构化类型而非直接引 AlertEvaluator 类：
// 避免 ingestion-service 反过来依赖 alert-evaluator（防循环依赖），且便于测试 mock
type AlertEvaluatorLike = { evaluate(projectId: string): Promise<void> };

export class IngestionService {
  constructor(
    private traceRepo: ITraceRepository,
    private alertEvaluator?: AlertEvaluatorLike,
  ) {}

  // 把一批 observations 按 traceId 分组，每组建一个 trace
  async ingest(projectId: string, observations: Observation[]) {
    const grouped = new Map<string, Observation[]>();
    for (const o of observations) {
      const list = grouped.get(o.traceId) ?? [];
      list.push(o);
      grouped.set(o.traceId, list);
    }

    for (const [traceId, obs] of grouped) {
      // trace 名取第一个 observation 的 name，或用 traceId
      const name = obs.find((o) => o.parentId == null)?.name ?? `trace-${traceId}`;
      await this.traceRepo.createTraceWithObservations(
        {
          projectId,
          name,
          userId: obs[0]?.userId ?? null,
          sessionId: obs[0]?.sessionId ?? null,
          input: obs[0]?.input,
          output: obs.find((o) => o.parentId == null)?.output,
          metadata: obs[0]?.metadata,
        },
        obs,
      );
      // M12: emit trace:created 事件供 SSE 订阅
      const trace: TraceListItem = {
        id: traceId,
        name,
        userId: obs[0]?.userId ?? null,
        sessionId: obs[0]?.sessionId ?? null,
        timestamp: new Date(),
      };
      eventBus.emit('trace:created', { projectId, trace });
    }

    // 写入完成后非阻塞触发告警评估：
    // setImmediate 把 evaluate 丢到下个事件循环，不阻塞 ingestion 的 202 响应；
    // evaluate 内部已 try/catch，这里再加 .catch() 兜底未捕获的 rejection
    if (this.alertEvaluator) {
      setImmediate(() => {
        this.alertEvaluator!.evaluate(projectId).catch(() => {});
      });
    }
  }
}
