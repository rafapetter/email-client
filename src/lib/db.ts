import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '@/server/db/schema';

// Turso remote DB in production, local SQLite file in development
const url = process.env.TURSO_DATABASE_URL ?? 'file:./data/email-client.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({
  url,
  ...(authToken && { authToken }),
});

export const db = drizzle(client, { schema });
