import { db, schema } from '../db/client.js';
import { eq } from 'drizzle-orm';

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  create(email: string, passwordHash: string): Promise<User>;
}

export class PostgresUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    return row ?? null;
  }

  async create(email: string, passwordHash: string): Promise<User> {
    const [row] = await db
      .insert(schema.users)
      .values({ email, passwordHash })
      .returning();
    return row;
  }
}
