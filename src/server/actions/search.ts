'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailAccounts, cachedEmails } from '@/server/db/schema';
import { and, eq, inArray, desc, or, like } from 'drizzle-orm';
import { searchWithEngine } from '@/server/search-engine';
import type { SerializedEmail } from '@/types';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function getAccount() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const account = db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.userId, session.user.id), eq(emailAccounts.isDefault, true)))
    .get();

  if (!account) throw new Error('No email account connected');
  return account;
}

function rowToSerializedEmail(row: typeof cachedEmails.$inferSelect): SerializedEmail {
  return {
    id: row.id,
    subject: row.subject ?? '',
    from: row.fromAddress ? { name: row.fromName ?? undefined, address: row.fromAddress } : null,
    to: row.toJson ? JSON.parse(row.toJson) : [],
    cc: row.ccJson ? JSON.parse(row.ccJson) : undefined,
    date: row.date ? row.date.toISOString() : '',
    body: (row.bodyText || row.bodyHtml) ? { text: row.bodyText ?? undefined, html: row.bodyHtml ?? undefined } : undefined,
    snippet: row.snippet ?? undefined,
    isRead: row.isRead,
    isStarred: row.isStarred,
    labels: row.labelsJson ? JSON.parse(row.labelsJson) : undefined,
    attachments: row.attachmentsJson ? JSON.parse(row.attachmentsJson) : [],
    threadId: row.threadId ?? undefined,
  };
}

/**
 * Search emails using emai SDK's SearchEngine (hybrid semantic + BM25).
 * Falls back to simple LIKE search if the search engine is unavailable.
 */
export async function searchEmails(
  query: string,
  _mode: 'hybrid' | 'semantic' | 'fulltext' = 'hybrid',
): Promise<ActionResult<SerializedEmail[]>> {
  try {
    const account = await getAccount();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return { success: true, data: [] };

    // Try the real search engine first (semantic + BM25 hybrid)
    let emailIds: string[] = [];
    try {
      const searchResults = await searchWithEngine(account.id, trimmedQuery, 50);
      emailIds = searchResults.map((r) => r.emailId);
    } catch (err) {
      console.warn('[Search] Engine search failed, falling back to LIKE:', err instanceof Error ? err.message : err);
    }

    if (emailIds.length > 0) {
      // Fetch full email rows by the IDs returned from the search engine
      const rows = db
        .select()
        .from(cachedEmails)
        .where(
          and(
            eq(cachedEmails.accountId, account.id),
            inArray(cachedEmails.id, emailIds),
          ),
        )
        .all();

      // Maintain the order from search results (ranked by relevance)
      const rowMap = new Map(rows.map((r) => [r.id, r]));
      const ordered = emailIds
        .map((id) => rowMap.get(id))
        .filter((r): r is typeof cachedEmails.$inferSelect => !!r);

      return { success: true, data: ordered.map(rowToSerializedEmail) };
    }

    // Fallback: simple LIKE search (if search engine hasn't indexed yet or failed)
    const pattern = `%${trimmedQuery}%`;
    const rows = db
      .select()
      .from(cachedEmails)
      .where(
        and(
          eq(cachedEmails.accountId, account.id),
          or(
            like(cachedEmails.subject, pattern),
            like(cachedEmails.fromAddress, pattern),
            like(cachedEmails.fromName, pattern),
            like(cachedEmails.bodyText, pattern),
            like(cachedEmails.snippet, pattern),
          ),
        ),
      )
      .orderBy(desc(cachedEmails.date))
      .limit(50)
      .all();

    return { success: true, data: rows.map(rowToSerializedEmail) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** No-op — search now uses the SearchEngine, indexing happens during sync */
export async function indexEmailsForSearch(): Promise<ActionResult<{ indexed: number }>> {
  return { success: true, data: { indexed: 0 } };
}
