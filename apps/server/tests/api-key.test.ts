import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey } from '../src/modules/api-key.js';

describe('api-key module', () => {
  it('generateApiKey 返回 raw 以 oat_ 开头', () => {
    const { raw } = generateApiKey();
    expect(raw.startsWith('oat_')).toBe(true);
  });

  it('generateApiKey 返回的 raw 有足够熵（oat_ + 至少 32 hex 字符）', () => {
    const { raw } = generateApiKey();
    expect(raw.length).toBeGreaterThanOrEqual(36);
  });

  it('generateApiKey 返回的 hash 是 64 位 hex（SHA-256）', () => {
    const { hash } = generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashApiKey(raw) 等于 generateApiKey 返回的 hash', () => {
    const { raw, hash } = generateApiKey();
    expect(hashApiKey(raw)).toBe(hash);
  });

  it('generateApiKey 返回的 preview 是 raw 后 4 位', () => {
    const { raw, preview } = generateApiKey();
    expect(raw.endsWith(preview)).toBe(true);
    expect(preview.length).toBe(4);
  });

  it('两次调用 generateApiKey 返回不同的 raw', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});
