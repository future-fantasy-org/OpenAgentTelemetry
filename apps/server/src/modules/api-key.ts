import { createHash, randomBytes } from 'node:crypto';

const PREFIX = 'oat_';

export function generateApiKey(): { raw: string; hash: string; preview: string } {
  const raw = PREFIX + randomBytes(24).toString('hex');
  return {
    raw,
    hash: hashApiKey(raw),
    preview: raw.slice(-4),
  };
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
