'use server';

import { auth } from '@/lib/auth';
import { getEmaiForAccount } from '@/lib/emai-client';
import { db } from '@/lib/db';
import { emailAccounts, cachedEmails } from '@/server/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { indexEmailsInSearchEngine } from '@/server/search-engine';
import type { SerializedEmail } from '@/types';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function getAccountAndEmai() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const account = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.userId, session.user.id), eq(emailAccounts.isDefault, true)))
    .get();

  if (!account) throw new Error('No email account connected');
  const emai = await getEmaiForAccount(account.id);
  return { account, emai };
}

async function getAccount() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const account = await db
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

/** Sync emails from IMAP into local SQLite cache */
export async function syncEmails(
  folder: string,
  limit: number = 50,
): Promise<ActionResult<{ synced: number; total: number }>> {
  try {
    const { account, emai } = await getAccountAndEmai();
    const result = await emai.emails.list({ folder, limit });
    const parsed = result as { items: unknown[]; total?: number };
    const items = parsed.items ?? [];

    let synced = 0;
    for (const raw of items) {
      const email = raw as Record<string, unknown>;
      const id = String(email.id ?? '');
      if (!id) continue;

      const from = email.from as { name?: string; address: string } | null | undefined;
      const to = email.to as Array<{ name?: string; address: string }> | undefined;
      const cc = email.cc as Array<{ name?: string; address: string }> | undefined;
      const body = email.body as { text?: string; html?: string } | undefined;
      const attachments = (email.attachments as Array<Record<string, unknown>> | undefined) ?? [];
      const date = email.date instanceof Date ? email.date : (email.date ? new Date(String(email.date)) : null);

      const existing = await db
        .select({ id: cachedEmails.id })
        .from(cachedEmails)
        .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.id, id)))
        .get();

      const values = {
        subject: String(email.subject ?? ''),
        fromAddress: from?.address ?? null,
        fromName: from?.name ?? null,
        toJson: to ? JSON.stringify(to) : null,
        ccJson: cc ? JSON.stringify(cc) : null,
        date,
        bodyText: body?.text ?? null,
        bodyHtml: body?.html ?? null,
        snippet: email.snippet != null ? String(email.snippet) : null,
        isRead: Boolean(email.isRead),
        isStarred: Boolean(email.isStarred),
        labelsJson: Array.isArray(email.labels) ? JSON.stringify(email.labels) : null,
        attachmentsJson: JSON.stringify(attachments.map((a) => ({
          id: String(a.id ?? ''),
          filename: String(a.filename ?? ''),
          contentType: String(a.contentType ?? ''),
          size: Number(a.size ?? 0),
        }))),
        threadId: email.threadId != null ? String(email.threadId) : null,
        folder,
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(cachedEmails)
          .set(values)
          .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.id, id)))
          .run();
      } else {
        await db.insert(cachedEmails)
          .values({
            id,
            accountId: account.id,
            ...values,
            aiProcessed: false,
            createdAt: new Date(),
          })
          .run();
      }
      synced++;
    }

    // Index synced emails in the search engine (background, non-blocking)
    if (synced > 0) {
      const syncedRows = await db
        .select()
        .from(cachedEmails)
        .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.folder, folder)))
        .orderBy(desc(cachedEmails.date))
        .limit(synced)
        .all();
      indexEmailsInSearchEngine(account.id, syncedRows).catch((err) => {
        console.warn('[Sync] Search indexing failed:', err instanceof Error ? err.message : err);
      });
    }

    return { success: true, data: { synced, total: parsed.total ?? items.length } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Read emails from local SQLite cache (instant) */
export async function getLocalEmails(
  folder: string,
  limit: number = 50,
  offset: number = 0,
): Promise<ActionResult<{ emails: SerializedEmail[]; total: number }>> {
  try {
    const account = await getAccount();

    const rows = await db
      .select()
      .from(cachedEmails)
      .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.folder, folder)))
      .orderBy(desc(cachedEmails.date))
      .limit(limit)
      .offset(offset)
      .all();

    const totalRow = await db
      .select({ count: cachedEmails.id })
      .from(cachedEmails)
      .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.folder, folder)))
      .all();

    return {
      success: true,
      data: {
        emails: rows.map(rowToSerializedEmail),
        total: totalRow.length,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Read single email from local cache, fall back to IMAP if no body */
export async function getLocalEmail(emailId: string): Promise<ActionResult<SerializedEmail>> {
  try {
    const account = await getAccount();

    const row = await db
      .select()
      .from(cachedEmails)
      .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.id, emailId)))
      .get();

    if (row && (row.bodyText || row.bodyHtml)) {
      return { success: true, data: rowToSerializedEmail(row) };
    }

    // Fall back to IMAP for full body
    const emai = await getEmaiForAccount(account.id);
    const result = await emai.emails.get(emailId);
    const email = result as Record<string, unknown>;
    const from = email.from as { name?: string; address: string } | null | undefined;
    const to = email.to as Array<{ name?: string; address: string }> | undefined;
    const cc = email.cc as Array<{ name?: string; address: string }> | undefined;
    const body = email.body as { text?: string; html?: string } | undefined;
    const attachments = (email.attachments as Array<Record<string, unknown>> | undefined) ?? [];

    // Update the cache with the full body
    if (row) {
      await db.update(cachedEmails)
        .set({
          bodyText: body?.text ?? null,
          bodyHtml: body?.html ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.id, emailId)))
        .run();
    }

    return {
      success: true,
      data: {
        id: String(email.id ?? ''),
        subject: String(email.subject ?? ''),
        from: from ?? null,
        to: to ?? [],
        cc,
        date: email.date instanceof Date ? email.date.toISOString() : String(email.date ?? ''),
        body: body ? { text: body.text, html: body.html } : undefined,
        snippet: email.snippet != null ? String(email.snippet) : undefined,
        isRead: Boolean(email.isRead),
        isStarred: Boolean(email.isStarred),
        labels: Array.isArray(email.labels) ? email.labels.map(String) : undefined,
        attachments: attachments.map((a) => ({
          id: String(a.id ?? ''),
          filename: String(a.filename ?? ''),
          contentType: String(a.contentType ?? ''),
          size: Number(a.size ?? 0),
        })),
        threadId: email.threadId != null ? String(email.threadId) : undefined,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
