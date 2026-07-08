import { describe, it, expect } from 'vitest';
import { withObservationContext, getCurrentObservationId, getCurrentParentId } from '../src/context.js';

describe('观察点上下文', () => {
  it('嵌套调用时父 id 正确传递', async () => {
    let outerId: string | undefined;
    let innerParentId: string | null = null;

    await withObservationContext('outer', async () => {
      outerId = getCurrentObservationId();
      await withObservationContext('inner', async () => {
        innerParentId = getCurrentParentId();
      });
    });

    expect(outerId).toBe('outer');
    expect(innerParentId).toBe('outer');
  });

  it('顶层无 parent', () => {
    expect(getCurrentObservationId()).toBeUndefined();
    expect(getCurrentParentId()).toBeNull();
  });
});
