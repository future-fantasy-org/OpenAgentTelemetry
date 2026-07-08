import type { ITraceRepository } from '../repositories/trace-repository.js';
import type { Observation } from '@oat/shared';

export class IngestionService {
  constructor(private traceRepo: ITraceRepository) {}

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
    }
  }
}
