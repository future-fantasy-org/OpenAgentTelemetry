import { randomUUID } from 'node:crypto';
import { OATClient, traceable, setDefaultClient, resetTraceId } from '../apps/sdk-ts/src/index.js';

const client = new OATClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'demo-api-key',
  flushAt: 100,
  flushInterval: 2000,
});

setDefaultClient(client);

const MODELS = [
  { model: 'gpt-4o', prompt: 120, completion: 80, cost: 0.005 },
  { model: 'gpt-4o-mini', prompt: 90, completion: 45, cost: 0.001 },
  { model: 'claude-3.5-sonnet', prompt: 150, completion: 100, cost: 0.008 },
];

const llmCall = traceable(
  async (input: string, modelIdx: number) => {
    const m = MODELS[modelIdx];
    return {
      output: `Response to: ${input}`,
      model: m.model,
      promptTokens: m.prompt,
      completionTokens: m.completion,
      totalCost: m.cost,
    };
  },
  { name: 'llm-call' },
);

const toolCall = traceable(
  async (tool: string, args: unknown) => {
    await new Promise((r) => setTimeout(r, 50));
    return { tool, result: `processed ${JSON.stringify(args).length} chars` };
  },
  { name: 'tool-call' },
);

const agentRun = traceable(
  async (query: string, modelIdx: number) => {
    const retrieved = await toolCall('search', { query });
    const llmResult = await llmCall(`${query} context=${retrieved.result}`, modelIdx);
    return llmResult;
  },
  { name: 'agent-run' },
);

async function main() {
  console.log('=== 开始灌入 10 条 Agent 链路 ===');
  for (let i = 0; i < 10; i++) {
    resetTraceId(randomUUID());
    const modelIdx = i % 3;
    await agentRun(`用户查询 #${i}: 天气怎么样`, modelIdx);
  }
  await client.shutdown();
  console.log('=== SDK 上报完成，共 10 traces × 3 observations = 30 observations ===');
}

main().catch(console.error);
