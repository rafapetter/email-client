/**
 * Singleton search engine using emai SDK's SearchEngine with SQLite vector store.
 * Provides real semantic (embedding-based) + BM25 full-text hybrid search.
 *
 * If the AI adapter doesn't support embeddings (e.g. Anthropic), falls back to
 * BM25 full-text search only — which is still far better than LIKE queries.
 */

import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { emailAccounts, cachedEmails } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

// Dynamic import to avoid bundling issues — loaded lazily on first use
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _emaiModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SearchEngine: (new (vectorStore: any, llm: any, storage?: any) => any) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SqliteVectorStore: (new (path?: string) => any) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createAdapter: ((config: Record<string, unknown>) => any) | null = null;

async function loadEmaiSdk() {
  if (_emaiModule) return true;
  try {
    _emaiModule = await import('@petter100/emai');
    SearchEngine = _emaiModule.SearchEngine;
    SqliteVectorStore = _emaiModule.SqliteVectorStore;
    createAdapter = _emaiModule.createAdapter;
    if (!SearchEngine || !SqliteVectorStore || !createAdapter) {
      console.error('[SearchEngine] Missing exports from emai SDK');
      return false;
    }
    console.log('[SearchEngine] emai SDK loaded successfully');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SearchEngine] Failed to load emai SDK:', msg);
    return false;
  }
}

const VECTOR_DB_PATH = './data/search-vectors.db';

// Cache search engine instances per account
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const engineCache = new Map<string, { engine: any; supportsEmbeddings: boolean; initialized: boolean; indexed: boolean }>();

/**
 * Get or create a SearchEngine for the given account.
 * Returns { engine, supportsEmbeddings } — use supportsEmbeddings to choose search method.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSearchEngine(accountId: string): Promise<{ engine: any; supportsEmbeddings: boolean; indexed: boolean }> {
  const loaded = await loadEmaiSdk();
  if (!loaded || !SearchEngine || !SqliteVectorStore || !createAdapter) {
    throw new Error('emai SDK not available');
  }

  const cached = engineCache.get(accountId);
  if (cached?.initialized) return cached;

  const account = db
    .select()
    .from(emailAccounts)
    .where(eq(emailAccounts.id, accountId))
    .get();

  if (!account) throw new Error('Account not found');

  // Create the LLM adapter for embeddings
  const llmAdapter = account.aiAdapter && account.aiApiKeyEncrypted
    ? createAdapter({
        adapter: account.aiAdapter,
        apiKey: decrypt(account.aiApiKeyEncrypted),
        ...(account.aiModel && { model: account.aiModel }),
      })
    : null;

  // Anthropic doesn't support embeddings natively
  const supportsEmbeddings = !!llmAdapter && account.aiAdapter !== 'anthropic';

  // Create SQLite vector store (persistent on disk)
  const vectorStore = new SqliteVectorStore(VECTOR_DB_PATH);

  // If we don't have an adapter that supports embeddings, we still create the engine
  // but will only use full-text search. We pass a dummy adapter that throws on embed.
  const adapterForSearch = llmAdapter ?? {
    name: 'noop',
    complete: async () => '',
    completeJSON: async () => ({}),
    embed: async () => { throw new Error('No embedding adapter configured'); },
  };

  const engine = new SearchEngine(vectorStore, adapterForSearch);

  const entry = { engine, supportsEmbeddings, initialized: true, indexed: false };
  engineCache.set(accountId, entry);
  return entry;
}

/**
 * Convert a cachedEmails row into an emai SDK Email object for indexing.
 */
function rowToEmaiEmail(row: typeof cachedEmails.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    threadId: row.threadId ?? undefined,
    provider: 'imap',
    from: {
      name: row.fromName ?? '',
      address: row.fromAddress ?? '',
    },
    to: row.toJson ? JSON.parse(row.toJson) : [],
    cc: row.ccJson ? JSON.parse(row.ccJson) : [],
    bcc: [],
    subject: row.subject ?? '',
    body: {
      text: row.bodyText ?? '',
      html: row.bodyHtml ?? '',
    },
    attachments: row.attachmentsJson ? JSON.parse(row.attachmentsJson) : [],
    labels: row.labelsJson ? JSON.parse(row.labelsJson) : [],
    folder: row.folder ?? 'INBOX',
    date: row.date ?? new Date(),
    receivedDate: row.date ?? new Date(),
    isRead: row.isRead,
    isStarred: row.isStarred,
    isDraft: false,
    headers: {},
    snippet: row.snippet ?? '',
  };
}

/**
 * Index a batch of email rows into the search engine.
 * Call this after syncing emails.
 */
export async function indexEmailsInSearchEngine(
  accountId: string,
  rows: Array<typeof cachedEmails.$inferSelect>,
): Promise<void> {
  if (rows.length === 0) return;
  const loaded = await loadEmaiSdk();
  if (!loaded) return;

  try {
    const { engine } = await getSearchEngine(accountId);
    const emails = rows.map(rowToEmaiEmail);

    // index() always populates full-text (BM25) first, then attempts vector embeddings.
    // If embeddings fail (e.g. Anthropic adapter), full-text search is still available.
    try {
      await engine.index(emails);
    } catch (embeddingErr) {
      // Embedding step failed, but full-text index was already populated
      console.warn('[SearchEngine] Embedding failed (full-text still works):', embeddingErr instanceof Error ? embeddingErr.message : embeddingErr);
    }

    // Mark as having indexed data
    const entry = engineCache.get(accountId);
    if (entry) entry.indexed = true;
  } catch (err) {
    console.error('[SearchEngine] Indexing error:', err instanceof Error ? err.message : err);
  }
}

/**
 * Index ALL cached emails for an account (used on first setup or reindex).
 */
export async function indexAllCachedEmails(accountId: string): Promise<number> {
  const loaded = await loadEmaiSdk();
  if (!loaded) return 0;

  const rows = db
    .select()
    .from(cachedEmails)
    .where(eq(cachedEmails.accountId, accountId))
    .all();

  if (rows.length === 0) return 0;

  // Index in batches of 50 to avoid memory issues
  const BATCH_SIZE = 50;
  let indexed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await indexEmailsInSearchEngine(accountId, batch);
    indexed += batch.length;
  }

  console.log(`[SearchEngine] Indexed ${indexed} emails for account ${accountId}`);
  return indexed;
}

/**
 * Search emails using the SearchEngine.
 * Uses hybrid (semantic + BM25) if embeddings are available, otherwise BM25 only.
 */
export async function searchWithEngine(
  accountId: string,
  query: string,
  limit = 50,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Array<{ emailId: string; score: number }>> {
  const loaded = await loadEmaiSdk();
  if (!loaded) return [];

  const entry = await getSearchEngine(accountId);
  const { engine, supportsEmbeddings } = entry;

  // On first search, index all cached emails
  if (!entry.indexed) {
    await indexAllCachedEmails(accountId);
    entry.indexed = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let results: Array<{ email: Record<string, unknown>; score: number; matchType: string }>;

  try {
    if (supportsEmbeddings) {
      results = await engine.searchHybrid(query, { limit, alpha: 0.6 });
    } else {
      results = await engine.searchFullText(query, { limit });
    }
  } catch (err) {
    // If hybrid fails (e.g. embedding error), fall back to full-text
    console.warn('[SearchEngine] Hybrid search failed, falling back to full-text:', err instanceof Error ? err.message : err);
    results = await engine.searchFullText(query, { limit });
  }

  return results.map((r) => ({
    emailId: String(r.email?.id ?? r.email),
    score: r.score,
  }));
}
