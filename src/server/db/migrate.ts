import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL ?? 'file:./data/email-client.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({
  url,
  ...(authToken && { authToken }),
});

const db = drizzle(client);

async function runMigrations() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  client.close();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
