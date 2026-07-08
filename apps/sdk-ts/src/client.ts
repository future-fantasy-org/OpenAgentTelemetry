import type { Observation } from '@oat/shared';

export interface OATClientConfig {
  baseUrl: string;
  apiKey: string;
  flushAt?: number;
  flushInterval?: number;
  fetch?: typeof fetch;
}

export class OATClient {
  private queue: Observation[] = [];
  private baseUrl: string;
  private apiKey: string;
  private flushAt: number;
  private flushInterval: number;
  private fetchFn: typeof fetch;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config: OATClientConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.flushAt = config.flushAt ?? 50;
    this.flushInterval = config.flushInterval ?? 1000;
    this.fetchFn = config.fetch ?? fetch;
    this.startTimer();
  }

  enqueue(obs: Observation) {
    this.queue.push(obs);
    if (this.queue.length >= this.flushAt) {
      void this.flush();
    }
  }

  private startTimer() {
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushInterval);
  }

  async flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      await this.fetchFn(`${this.baseUrl}/api/public/ingestion`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ batch }),
      });
    } catch (err) {
      console.warn('[OAT] 上报失败，丢弃批次：', err);
    }
  }

  async shutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }
}
