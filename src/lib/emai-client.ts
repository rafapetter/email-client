import { createRequire } from 'node:module';
import { join } from 'node:path';
import { decrypt } from './crypto';
import { db } from './db';
import { emailAccounts } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

// Use createRequire anchored to project root so it resolves the local file: dependency
const _require = createRequire(join(process.cwd(), 'package.json'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createEmai: (config: any) => any;
try {
  const emaiModule = _require('@petter100/emai');
  createEmai = emaiModule.createEmai || emaiModule.default?.createEmai;
  if (!createEmai) throw new Error('createEmai not found in module exports');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  createEmai = () => { throw new Error(`@petter100/emai failed to load: ${msg}`); };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmaiInstance = any;

interface CachedInstance {
  emai: EmaiInstance;
  lastUsed: number;
  consecutiveFailures: number;
}

const instances = new Map<string, CachedInstance>();

// In-flight connection promises to prevent duplicate connect attempts
const connecting = new Map<string, Promise<EmaiInstance>>();

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 15_000; // 15s timeout per attempt
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000; // 1s, 2s, 4s exponential backoff

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [id, cached] of instances) {
      if (now - cached.lastUsed > IDLE_TIMEOUT_MS) {
        cached.emai.disconnect().catch(() => {});
        instances.delete(id);
      }
    }
  }, 5 * 60 * 1000);
}

/** Wraps a promise with a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/** Sleep for exponential backoff */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Connect with retry + exponential backoff + timeout */
async function connectWithRetry(
  emai: EmaiInstance,
  accountId: string,
  meta: { providerType: string; host: string },
): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await withTimeout(emai.connect(), CONNECT_TIMEOUT_MS, 'IMAP/SMTP connect');
      if (attempt > 0) {
        console.log(`[emai-client] Connected on retry ${attempt} for account ${accountId}`);
      }
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[emai-client] Connect attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${accountId}:`, lastError.message);

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 1s, 2s, 4s
        await sleep(delay);
      }
    }
  }

  console.error('[emai-client] All connection attempts failed for account', accountId, {
    providerType: meta.providerType,
    host: meta.host,
    error: lastError?.message,
  });
  throw lastError;
}

function buildConfig(account: typeof emailAccounts.$inferSelect) {
  const credentials = JSON.parse(decrypt(account.credentialsEncrypted)) as Record<string, unknown>;

  let providerConfig: Record<string, unknown>;

  if (account.providerType === 'imap') {
    const smtp = credentials.smtp as Record<string, unknown> | undefined;
    const smtpPort = smtp ? Number(smtp.port ?? 587) : 587;
    providerConfig = {
      type: 'imap',
      imap: {
        host: credentials.host,
        port: credentials.port,
        secure: credentials.port === 993,
        auth: credentials.auth,
      },
      smtp: smtp ? {
        host: smtp.host,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: smtp.auth,
      } : {
        host: String(credentials.host ?? '').replace('imap', 'smtp'),
        port: 587,
        secure: false,
        auth: credentials.auth,
      },
    };
  } else {
    providerConfig = {
      type: account.providerType,
      credentials,
    };
  }

  const config: Record<string, unknown> = {
    provider: providerConfig,
    storage: { type: 'memory' },
  };

  if (account.aiAdapter && account.aiApiKeyEncrypted) {
    config.ai = {
      adapter: account.aiAdapter,
      apiKey: decrypt(account.aiApiKeyEncrypted),
      ...(account.aiModel && { model: account.aiModel }),
    };
  }

  const host = providerConfig.type === 'imap'
    ? String((providerConfig.imap as Record<string, unknown>)?.host ?? 'N/A')
    : 'N/A';

  return { config, providerConfig, host };
}

export async function getEmaiForAccount(accountId: string): Promise<EmaiInstance> {
  // 1. Return healthy cached instance
  const cached = instances.get(accountId);
  if (cached) {
    cached.lastUsed = Date.now();
    if (cached.emai.isConnected()) {
      cached.consecutiveFailures = 0;
      return cached.emai;
    }
    // Try reconnecting the cached instance with retry
    try {
      const account = await db.select().from(emailAccounts).where(eq(emailAccounts.id, accountId)).get();
      await connectWithRetry(cached.emai, accountId, {
        providerType: account?.providerType ?? 'unknown',
        host: 'cached',
      });
      cached.consecutiveFailures = 0;
      return cached.emai;
    } catch {
      instances.delete(accountId);
      // Fall through to create new instance
    }
  }

  // 2. Deduplicate in-flight connection attempts
  const inflight = connecting.get(accountId);
  if (inflight) {
    return inflight;
  }

  // 3. Create new instance with retry
  const connectPromise = (async () => {
    try {
      const account = await db.select().from(emailAccounts).where(eq(emailAccounts.id, accountId)).get();
      if (!account) {
        throw new Error(`Email account not found: ${accountId}`);
      }

      const { config, host } = buildConfig(account);
      const emai = createEmai(config);

      await connectWithRetry(emai, accountId, {
        providerType: account.providerType,
        host,
      });

      instances.set(accountId, { emai, lastUsed: Date.now(), consecutiveFailures: 0 });
      return emai;
    } finally {
      connecting.delete(accountId);
    }
  })();

  connecting.set(accountId, connectPromise);
  return connectPromise;
}

export async function disconnectAccount(accountId: string): Promise<void> {
  const cached = instances.get(accountId);
  if (cached) {
    await cached.emai.disconnect().catch(() => {});
    instances.delete(accountId);
  }
}

export async function disconnectAll(): Promise<void> {
  for (const [id, cached] of instances) {
    await cached.emai.disconnect().catch(() => {});
    instances.delete(id);
  }
}
