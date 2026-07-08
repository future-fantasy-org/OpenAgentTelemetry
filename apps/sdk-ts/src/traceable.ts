import { randomUUID } from 'node:crypto';
import { withObservationContext, getCurrentParentId } from './context.js';
import type { OATClient } from './client.js';
import type { Observation } from '@oat/shared';

let defaultClient: OATClient | null = null;

export function setDefaultClient(client: OATClient | null) {
  defaultClient = client;
}

type TraceableOptions = {
  name?: string;
  type?: Observation['type'];
};

export function traceable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: TraceableOptions = {},
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const id = randomUUID();
    const name = options.name ?? fn.name ?? 'anonymous';
    const startTime = new Date();

    return withObservationContext(id, async () => {
      try {
        const result = await fn(...args);
        const endTime = new Date();
        if (defaultClient) {
          defaultClient.enqueue({
            id,
            traceId: getOrInitTraceId(),
            parentId: getCurrentParentId(),
            type: options.type ?? 'span',
            name,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            input: args,
            output: result,
          });
        }
        return result;
      } catch (err) {
        const endTime = new Date();
        if (defaultClient) {
          defaultClient.enqueue({
            id,
            traceId: getOrInitTraceId(),
            parentId: getCurrentParentId(),
            type: options.type ?? 'span',
            name,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            level: 'error',
            output: { error: String(err) },
          });
        }
        throw err;
      }
    });
  };
}

let _traceId: string = randomUUID();

function getOrInitTraceId(): string {
  return _traceId;
}

export function resetTraceId(id?: string) {
  _traceId = id ?? randomUUID();
}
