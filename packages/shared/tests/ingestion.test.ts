import { describe, it, expect } from 'vitest';
import { ingestionBatchSchema } from '../src/ingestion.js';

describe('ingestionBatchSchema', () => {
  it('接受合法的批量上报', () => {
    const valid = {
      batch: [
        {
          id: 'obs-1',
          traceId: 'trace-1',
          parentId: null,
          type: 'span',
          name: 'root',
          startTime: '2026-07-09T00:00:00Z',
          endTime: '2026-07-09T00:00:01Z',
          input: { q: 'hello' },
          output: { a: 'hi' },
          metadata: {},
        },
      ],
    };
    expect(() => ingestionBatchSchema.parse(valid)).not.toThrow();
  });

  it('拒绝缺少 traceId 的观测点', () => {
    const invalid = { batch: [{ id: 'obs-1' }] };
    expect(() => ingestionBatchSchema.parse(invalid)).toThrow();
  });

  it('拒绝无效的 type', () => {
    const invalid = {
      batch: [
        {
          id: '1', traceId: 't1', parentId: null,
          type: 'invalid-type', name: 'x',
          startTime: '2026-07-09T00:00:00Z',
        },
      ],
    };
    expect(() => ingestionBatchSchema.parse(invalid)).toThrow();
  });
});
