import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// 从环境变量读连接串，给默认值方便本地开发
const connectionString = process.env.DATABASE_URL ?? 'postgresql://oat:oat@localhost:5432/oat';

// postgres 客户端（用于实际查询）
const queryClient = postgres(connectionString);

// drizzle 实例，绑定 schema 以便关系查询
export const db = drizzle(queryClient, { schema });
export { schema };
