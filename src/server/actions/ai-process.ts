'use server';

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { auth } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { emailAccounts, cachedEmails } from '@/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { setCachedEnrichment } from './ai-cache';
import type { AiProcessingStatus } from '@/types';

// Load AiEngine directly from emai SDK — no IMAP/provider needed
const _require = createRequire(join(process.cwd(), 'package.json'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AiEngine: new (config: any) => any;
try {
  const emaiModule = _require('@petter100/emai');
  AiEngine = emaiModule.AiEngine;
  if (!AiEngine) throw new Error('AiEngine not found in exports');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  AiEngine = class { constructor() { throw new Error(`@petter100/emai failed to load: ${msg}`); } } as never;
}

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function getAccountWithAi() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const account = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.userId, session.user.id), eq(emailAccounts.isDefault, true)))
    .get();

  if (!account) throw new Error('No email account connected');
  if (!account.aiAdapter || !account.aiApiKeyEncrypted) {
    throw new Error('No AI adapter configured');
  }

  return account;
}

/**
 * Create a standalone AiEngine — no IMAP, no provider, just AI.
 * AiEngine accepts an adapter config object directly.
 */
function createAiEngine(account: typeof emailAccounts.$inferSelect) {
  return new AiEngine({
    adapter: account.aiAdapter,
    apiKey: decrypt(account.aiApiKeyEncrypted!),
    ...(account.aiModel && { model: account.aiModel }),
  });
}

/** Get counts of processed vs total emails */
export async function getAiProcessingStatus(): Promise<ActionResult<AiProcessingStatus>> {
  try {
    const account = await getAccountWithAi();

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(cachedEmails)
      .where(eq(cachedEmails.accountId, account.id))
      .get();

    const processedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(cachedEmails)
      .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.aiProcessed, true)))
      .get();

    const total = totalResult?.count ?? 0;
    const processed = processedResult?.count ?? 0;

    return {
      success: true,
      data: { processed, total, isProcessing: processed < total },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Wrap a promise with a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI call timeout')), ms)),
  ]);
}

const AI_TIMEOUT_MS = 30_000; // 30s per AI call

/** Process one email with all AI features, returns true if enrichment succeeded */
async function processOneEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aiEngine: any,
  accountId: string,
  row: typeof cachedEmails.$inferSelect,
): Promise<boolean> {
  try {
    const emailContent = {
      subject: row.subject ?? '',
      body: { text: row.bodyText ?? undefined, html: row.bodyHtml ?? undefined },
      from: row.fromAddress ? { name: row.fromName ?? undefined, address: row.fromAddress } : undefined,
      to: row.toJson ? JSON.parse(row.toJson) : [],
      date: row.date ? row.date.toISOString() : undefined,
      snippet: row.snippet ?? undefined,
    };

    const enrichment: Record<string, unknown> = {};

    // AiEngine methods: classifyEmail, prioritizeEmail, summarizeEmail, detectActions, extractTopics
    const [classifyRes, prioritizeRes, summarizeRes, actionsRes, topicsRes] = await Promise.allSettled([
      withTimeout(aiEngine.classifyEmail(emailContent), AI_TIMEOUT_MS),
      withTimeout(aiEngine.prioritizeEmail(emailContent), AI_TIMEOUT_MS),
      withTimeout(aiEngine.summarizeEmail(emailContent), AI_TIMEOUT_MS),
      withTimeout(aiEngine.detectActions(emailContent), AI_TIMEOUT_MS),
      withTimeout(aiEngine.extractTopics(emailContent), AI_TIMEOUT_MS),
    ]);

    if (classifyRes.status === 'fulfilled') enrichment.classification = classifyRes.value;
    if (prioritizeRes.status === 'fulfilled') enrichment.priority = prioritizeRes.value;
    if (summarizeRes.status === 'fulfilled') enrichment.summary = summarizeRes.value;
    if (actionsRes.status === 'fulfilled') enrichment.actionItems = actionsRes.value;
    if (topicsRes.status === 'fulfilled') enrichment.topics = topicsRes.value;

    if (Object.keys(enrichment).length > 0) {
      await setCachedEnrichment(accountId, row.id, enrichment);
    }

    // Mark as processed even if some features failed
    await db.update(cachedEmails)
      .set({ aiProcessed: true, updatedAt: new Date() })
      .where(and(eq(cachedEmails.accountId, accountId), eq(cachedEmails.id, row.id)))
      .run();

    // Evaluate workflow rules (fire-and-forget)
    import('./workflow-rules').then(({ evaluateWorkflowRules }) => {
      evaluateWorkflowRules(row.id).catch(() => {});
    }).catch(() => {});

    return true;
  } catch (err) {
    console.warn(`[AI:process] Failed for ${row.id}:`, err);
    // Still mark as processed to avoid infinite retries on bad emails
    await db.update(cachedEmails)
      .set({ aiProcessed: true, updatedAt: new Date() })
      .where(and(eq(cachedEmails.accountId, accountId), eq(cachedEmails.id, row.id)))
      .run();
    return false;
  }
}

/** Process a batch of unprocessed emails — all emails in batch run in parallel */
export async function processUnprocessedEmails(
  batchSize: number = 5,
): Promise<ActionResult<{ processed: number; remaining: number }>> {
  try {
    const account = await getAccountWithAi();
    const aiEngine = createAiEngine(account);

    const unprocessed = await db
      .select()
      .from(cachedEmails)
      .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.aiProcessed, false)))
      .limit(batchSize)
      .all();

    if (unprocessed.length === 0) {
      return { success: true, data: { processed: 0, remaining: 0 } };
    }

    // Process ALL emails in the batch in parallel (not sequentially)
    const results = await Promise.allSettled(
      unprocessed.map((row) => processOneEmail(aiEngine, account.id, row)),
    );

    const processedCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value,
    ).length;

    const remainingResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(cachedEmails)
      .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.aiProcessed, false)))
      .get();

    return {
      success: true,
      data: { processed: processedCount, remaining: remainingResult?.count ?? 0 },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
