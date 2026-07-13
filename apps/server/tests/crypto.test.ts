import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { aesGcmEncrypt, aesGcmDecrypt, validateEncryptionKey } from '../src/modules/crypto.js';

describe('crypto', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => { process.env.ENCRYPTION_KEY = Buffer.alloc(32, 0x41).toString('base64'); });

  afterEach(() => {
    if (originalKey !== undefined) process.env.ENCRYPTION_KEY = originalKey;
    else delete process.env.ENCRYPTION_KEY;
  });

  it('加密→解密还原原文', () => {
    const plaintext = 'sk-proj-abc123xyz';
    const enc = aesGcmEncrypt(plaintext);
    expect(enc).not.toBe(plaintext);
    expect(aesGcmDecrypt(enc)).toBe(plaintext);
  });

  it('每次加密密文不同（IV 随机）', () => {
    const a = aesGcmEncrypt('hello');
    const b = aesGcmEncrypt('hello');
    expect(a).not.toBe(b);
    expect(aesGcmDecrypt(a)).toBe('hello');
    expect(aesGcmDecrypt(b)).toBe('hello');
  });

  it('密文含 IV + authTag + ciphertext（至少 28 字节）', () => {
    const decoded = Buffer.from(aesGcmEncrypt('test'), 'base64');
    expect(decoded.length).toBeGreaterThan(28);
  });

  it('错误 key 解密失败抛错', () => {
    const enc = aesGcmEncrypt('secret');
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
    expect(() => aesGcmDecrypt(enc)).toThrow();
  });

  it('空 key 校验抛错', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => validateEncryptionKey()).toThrow('ENCRYPTION_KEY');
  });

  it('validateEncryptionKey 正常时不抛错', () => {
    expect(() => validateEncryptionKey()).not.toThrow();
  });
});
