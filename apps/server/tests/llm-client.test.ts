import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatComplete } from '../src/modules/llm-client.js';

const provider = { baseURL: 'https://api.openai.com/v1', apiKey: 'sk-test-key' };
const messages = [{ role: 'user', content: 'hello' }];

function mockFetch(body: unknown, status = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe('chatComplete', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('解析 OpenAI 兼容格式（content + tokens）', async () => {
    mockFetch({
      choices: [{ message: { role: 'assistant', content: '你好' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const res = await chatComplete(provider, 'gpt-4o', messages);

    expect(res.content).toBe('你好');
    expect(res.promptTokens).toBe(10);
    expect(res.completionTokens).toBe(5);
  });

  it('HTTP 错误（401）抛出包含 401 的错误', async () => {
    mockFetch({ error: 'invalid api key' }, 401);

    await expect(chatComplete(provider, 'gpt-4o', messages)).rejects.toThrow('401');
  });

  it('空 choices 抛错', async () => {
    mockFetch({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 0 } });

    await expect(chatComplete(provider, 'gpt-4o', messages)).rejects.toThrow('空 choices');
  });

  it('usage 缺失时 tokens 为 null', async () => {
    mockFetch({ choices: [{ message: { content: 'hi' } }] });

    const res = await chatComplete(provider, 'gpt-4o', messages);

    expect(res.content).toBe('hi');
    expect(res.promptTokens).toBeNull();
    expect(res.completionTokens).toBeNull();
  });

  it('发送正确的 Authorization header + body model', async () => {
    const spy = mockFetch({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    await chatComplete(provider, 'gpt-4o-mini', messages);

    expect(spy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = spy.mock.calls[0];
    expect(calledUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test-key',
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toEqual(messages);
  });
});
