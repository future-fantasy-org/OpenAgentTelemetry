import { randomUUID } from 'node:crypto';
import { OATClient, traceable, setDefaultClient, resetTraceId } from '../apps/sdk-ts/src/index.js';

const client = new OATClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'demo-api-key',
  flushAt: 1,
  flushInterval: 1000,
});

setDefaultClient(client);
resetTraceId(randomUUID());

const greet = traceable(async (name: string) => `Hello, ${name}!`, { name: 'greet' });

async function main() {
  const result = await greet('World');
  console.log('结果:', result);
  await client.shutdown();
  console.log('SDK 上报完成');
}

main();
