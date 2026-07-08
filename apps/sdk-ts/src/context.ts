import { AsyncLocalStorage } from 'node:async_hooks';

type ContextNode = { id: string; parentId: string | null };

const storage = new AsyncLocalStorage<ContextNode>();

export function getCurrentObservationId(): string | undefined {
  return storage.getStore()?.id;
}

export function getCurrentParentId(): string | null {
  return storage.getStore()?.parentId ?? null;
}

export async function withObservationContext<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const parentId = getCurrentObservationId() ?? null;
  return storage.run({ id, parentId }, fn);
}
