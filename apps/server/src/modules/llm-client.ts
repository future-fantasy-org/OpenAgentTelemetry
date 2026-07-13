export interface LLMResponse {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export async function chatComplete(
  provider: { baseURL: string; apiKey: string },
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<LLMResponse> {
  const url = `${provider.baseURL.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({ model, messages }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM API ${res.status}: ${text}`);
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('LLM API 返回空 choices');
    return {
      content: choice.message?.content ?? '',
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
