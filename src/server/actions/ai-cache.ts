'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiEnrichments, emailAccounts } from '@/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { AiEnrichment } from '@/types';
import { randomUUID } from 'crypto';

function parseJSON<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function rowToEnrichment(row: typeof aiEnrichments.$inferSelect): AiEnrichment {
  const enrichment: AiEnrichment = {};
  if (row.priority) enrichment.priority = parseJSON(row.priority);
  if (row.classification) enrichment.classification = parseJSON(row.classification);
  if (row.summary) enrichment.summary = parseJSON(row.summary);
  if (row.actionItems) enrichment.actionItems = parseJSON(row.actionItems);
  if (row.topics) enrichment.topics = parseJSON(row.topics);
  if (row.extractedData) enrichment.extractedData = parseJSON(row.extractedData);
  return enrichment;
}

/** Read a single cached enrichment */
export async function getCachedEnrichment(
  accountId: string,
  emailId: string,
): Promise<AiEnrichment | null> {
  const row = db
    .select()
    .from(aiEnrichments)
    .where(and(eq(aiEnrichments.accountId, accountId), eq(aiEnrichments.emailId, emailId)))
    .get();
  if (!row) return null;
  return rowToEnrichment(row);
}

/** Batch read cached enrichments for a list of email IDs */
export async function getCachedEnrichments(
  accountId: string,
  emailIds: string[],
): Promise<Record<string, AiEnrichment>> {
  if (emailIds.length === 0) return {};

  // SQLite has a variable limit (~999), chunk if needed
  const CHUNK = 500;
  const result: Record<string, AiEnrichment> = {};

  for (let i = 0; i < emailIds.length; i += CHUNK) {
    const chunk = emailIds.slice(i, i + CHUNK);
    const rows = db
      .select()
      .from(aiEnrichments)
      .where(and(eq(aiEnrichments.accountId, accountId), inArray(aiEnrichments.emailId, chunk)))
      .all();

    for (const row of rows) {
      const enrichment = rowToEnrichment(row);
      if (enrichment.priority || enrichment.classification || enrichment.summary || enrichment.actionItems || enrichment.topics) {
        result[row.emailId] = enrichment;
      }
    }
  }

  return result;
}

/** Upsert a partial enrichment — merges with existing data */
export async function setCachedEnrichment(
  accountId: string,
  emailId: string,
  partial: Partial<AiEnrichment>,
): Promise<void> {
  const existing = db
    .select()
    .from(aiEnrichments)
    .where(and(eq(aiEnrichments.accountId, accountId), eq(aiEnrichments.emailId, emailId)))
    .get();

  const now = new Date();

  if (existing) {
    // Merge: only update columns that have new data
    const updates: Record<string, unknown> = { updatedAt: now };
    if (partial.priority) updates.priority = JSON.stringify(partial.priority);
    if (partial.classification) updates.classification = JSON.stringify(partial.classification);
    if (partial.summary) updates.summary = JSON.stringify(partial.summary);
    if (partial.actionItems) updates.actionItems = JSON.stringify(partial.actionItems);
    if (partial.topics) updates.topics = JSON.stringify(partial.topics);
    if (partial.extractedData) updates.extractedData = JSON.stringify(partial.extractedData);

    db.update(aiEnrichments)
      .set(updates)
      .where(eq(aiEnrichments.id, existing.id))
      .run();
  } else {
    db.insert(aiEnrichments)
      .values({
        id: randomUUID(),
        accountId,
        emailId,
        priority: partial.priority ? JSON.stringify(partial.priority) : null,
        classification: partial.classification ? JSON.stringify(partial.classification) : null,
        summary: partial.summary ? JSON.stringify(partial.summary) : null,
        actionItems: partial.actionItems ? JSON.stringify(partial.actionItems) : null,
        topics: partial.topics ? JSON.stringify(partial.topics) : null,
        extractedData: partial.extractedData ? JSON.stringify(partial.extractedData) : null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

/** Public server action: load cached enrichments for the current user's emails */
export async function loadEnrichmentsForEmails(
  emailIds: string[],
): Promise<Record<string, AiEnrichment>> {
  const session = await auth();
  if (!session?.user?.id) return {};

  const account = db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.userId, session.user.id), eq(emailAccounts.isDefault, true)))
    .get();

  if (!account) return {};
  return await getCachedEnrichments(account.id, emailIds);
}
