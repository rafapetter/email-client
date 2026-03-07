'use server';

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { auth } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { emailAccounts, cachedEmails } from '@/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { getCachedEnrichment, getCachedEnrichments, setCachedEnrichment } from './ai-cache';

// Load AiEngine directly — no IMAP/provider needed for AI operations
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

export type EmailContent = {
  subject: string;
  body?: { text?: string; html?: string };
  from?: { name?: string; address: string } | null;
  to?: Array<{ name?: string; address: string }>;
  date?: string;
  attachments?: Array<{ id: string; filename: string; contentType: string; size: number }>;
};

async function getAccountWithAi() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const account = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.userId, session.user.id), eq(emailAccounts.isDefault, true)))
    .get();

  if (!account) throw new Error('No email account connected');

  if (!account.aiAdapter) {
    throw new Error('No AI adapter configured. Go to Settings > Accounts and select an AI provider (OpenAI, Anthropic, etc.) with a valid API key.');
  }
  if (!account.aiApiKeyEncrypted) {
    throw new Error('No AI API key configured. Go to Settings > Accounts and add your API key.');
  }

  return account;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createAiEngine(account: typeof emailAccounts.$inferSelect): any {
  return new AiEngine({
    adapter: account.aiAdapter,
    apiKey: decrypt(account.aiApiKeyEncrypted!),
    ...(account.aiModel && { model: account.aiModel }),
  });
}

/** Load email content from local SQLite cache */
async function getEmailContentFromCache(accountId: string, emailId: string): Promise<EmailContent | null> {
  const row = await db
    .select()
    .from(cachedEmails)
    .where(and(eq(cachedEmails.accountId, accountId), eq(cachedEmails.id, emailId)))
    .get();

  if (!row) return null;

  return {
    subject: row.subject ?? '',
    body: { text: row.bodyText ?? undefined, html: row.bodyHtml ?? undefined },
    from: row.fromAddress ? { name: row.fromName ?? undefined, address: row.fromAddress } : undefined,
    to: row.toJson ? JSON.parse(row.toJson) : [],
    date: row.date ? row.date.toISOString() : undefined,
  };
}

/** Load multiple email contents from local SQLite cache */
async function getEmailContentsFromCache(accountId: string, emailIds: string[]): Promise<Array<{ id: string; content: EmailContent }>> {
  const rows = await db
    .select()
    .from(cachedEmails)
    .where(and(eq(cachedEmails.accountId, accountId), inArray(cachedEmails.id, emailIds)))
    .all();

  return rows.map((row) => ({
    id: row.id,
    content: {
      subject: row.subject ?? '',
      body: { text: row.bodyText ?? undefined, html: row.bodyHtml ?? undefined },
      from: row.fromAddress ? { name: row.fromName ?? undefined, address: row.fromAddress } : undefined,
      to: row.toJson ? JSON.parse(row.toJson) : [],
      date: row.date ? row.date.toISOString() : undefined,
    },
  }));
}

export async function classifyEmail(
  emailId: string,
  emailContent?: EmailContent,
): Promise<ActionResult<{ category: string; confidence: number; sentiment: string; urgency: string }>> {
  try {
    const account = await getAccountWithAi();
    const cached = await getCachedEnrichment(account.id, emailId);
    if (cached?.classification) return { success: true, data: cached.classification };

    const email = emailContent ?? await getEmailContentFromCache(account.id, emailId);
    if (!email) return { success: false, error: 'Email not found in cache' };

    const aiEngine = createAiEngine(account);
    const result = await aiEngine.classifyEmail(email);
    const data = result as { category: string; confidence: number; sentiment: string; urgency: string };
    await setCachedEnrichment(account.id, emailId, { classification: data });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function summarizeEmail(
  emailId: string,
  emailContent?: EmailContent,
): Promise<ActionResult<{ summary: string; keyPoints: string[] }>> {
  try {
    const account = await getAccountWithAi();
    const cached = await getCachedEnrichment(account.id, emailId);
    if (cached?.summary) return { success: true, data: cached.summary };

    const email = emailContent ?? await getEmailContentFromCache(account.id, emailId);
    if (!email) return { success: false, error: 'Email not found in cache' };

    const aiEngine = createAiEngine(account);
    const result = await aiEngine.summarizeEmail(email);
    const data = result as { summary: string; keyPoints: string[] };
    await setCachedEnrichment(account.id, emailId, { summary: data });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function prioritizeEmail(
  emailId: string,
  emailContent?: EmailContent,
): Promise<ActionResult<{ score: number; level: string; reasoning: string }>> {
  try {
    const account = await getAccountWithAi();
    const cached = await getCachedEnrichment(account.id, emailId);
    if (cached?.priority) return { success: true, data: cached.priority };

    const email = emailContent ?? await getEmailContentFromCache(account.id, emailId);
    if (!email) return { success: false, error: 'Email not found in cache' };

    const aiEngine = createAiEngine(account);
    const result = await aiEngine.prioritizeEmail(email);
    const data = result as { score: number; level: string; reasoning: string };
    await setCachedEnrichment(account.id, emailId, { priority: data });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function detectActions(
  emailId: string,
  emailContent?: EmailContent,
): Promise<ActionResult<Array<{ action: string; priority: string; deadline?: string }>>> {
  try {
    const account = await getAccountWithAi();
    const cached = await getCachedEnrichment(account.id, emailId);
    if (cached?.actionItems) return { success: true, data: cached.actionItems };

    const email = emailContent ?? await getEmailContentFromCache(account.id, emailId);
    if (!email) return { success: false, error: 'Email not found in cache' };

    const aiEngine = createAiEngine(account);
    const result = await aiEngine.detectActions(email);
    const data = result as Array<{ action: string; priority: string; deadline?: string }>;
    await setCachedEnrichment(account.id, emailId, { actionItems: data });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function batchClassifyAndPrioritize(
  emails: Array<{ id: string; content: EmailContent }>,
): Promise<ActionResult<Record<string, { priority?: { score: number; level: string; reasoning: string }; classification?: { category: string; confidence: number; sentiment: string; urgency: string } }>>> {
  try {
    const account = await getAccountWithAi();
    const aiEngine = createAiEngine(account);
    const results: Record<string, { priority?: { score: number; level: string; reasoning: string }; classification?: { category: string; confidence: number; sentiment: string; urgency: string } }> = {};

    const emailIds = emails.map((e) => e.id);
    const cachedMap = await getCachedEnrichments(account.id, emailIds);

    const uncached: typeof emails = [];
    for (const e of emails) {
      const cached = cachedMap[e.id];
      if (cached?.priority && cached?.classification) {
        results[e.id] = { priority: cached.priority, classification: cached.classification };
      } else {
        uncached.push(e);
      }
    }

    const batchSize = 5;
    for (let i = 0; i < uncached.length; i += batchSize) {
      const batch = uncached.slice(i, i + batchSize);
      const promises = batch.map(async ({ id, content }) => {
        const entry: typeof results[string] = {};
        try {
          const [priorityResult, classifyResult] = await Promise.allSettled([
            aiEngine.prioritizeEmail(content),
            aiEngine.classifyEmail(content),
          ]);
          if (priorityResult.status === 'fulfilled') {
            entry.priority = priorityResult.value as { score: number; level: string; reasoning: string };
          }
          if (classifyResult.status === 'fulfilled') {
            entry.classification = classifyResult.value as { category: string; confidence: number; sentiment: string; urgency: string };
          }
          if (entry.priority || entry.classification) {
            await setCachedEnrichment(account.id, id, {
              ...(entry.priority && { priority: entry.priority }),
              ...(entry.classification && { classification: entry.classification }),
            });
          }
        } catch {
          // Skip failures for individual emails
        }
        results[id] = entry;
      });
      await Promise.allSettled(promises);
    }

    return { success: true, data: results };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function composeEmail(
  options: { to?: string; subject?: string; instructions: string },
): Promise<ActionResult<{ subject: string; body: string }>> {
  try {
    const account = await getAccountWithAi();
    const aiEngine = createAiEngine(account);
    const result = await aiEngine.composeEmail(options);
    return { success: true, data: result as { subject: string; body: string } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function generateReply(
  emailId: string,
  options?: { instructions?: string; tone?: string },
): Promise<ActionResult<{ subject: string; body: string }>> {
  try {
    const account = await getAccountWithAi();
    const email = await getEmailContentFromCache(account.id, emailId);
    if (!email) return { success: false, error: 'Email not found in cache' };

    const aiEngine = createAiEngine(account);
    const result = await aiEngine.replyToEmail(email, options ?? {});
    return { success: true, data: result as { subject: string; body: string } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function extractTopics(
  emailId: string,
  emailContent?: EmailContent,
): Promise<ActionResult<string[]>> {
  try {
    const account = await getAccountWithAi();
    const cached = await getCachedEnrichment(account.id, emailId);
    if (cached?.topics) return { success: true, data: cached.topics };

    const email = emailContent ?? await getEmailContentFromCache(account.id, emailId);
    if (!email) return { success: false, error: 'Email not found in cache' };

    const aiEngine = createAiEngine(account);
    const result = await aiEngine.extractTopics(email);
    const data = result as string[];
    await setCachedEnrichment(account.id, emailId, { topics: data });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function askAi(
  question: string,
  emailIds?: string[],
): Promise<ActionResult<{ answer: string; sources: Array<{ emailId: string; subject: string }>; confidence: number }>> {
  try {
    const account = await getAccountWithAi();
    const aiEngine = createAiEngine(account);

    // Load email content from local SQLite cache (no IMAP needed)
    let emailContents: Array<{ id: string; content: EmailContent }> = [];
    if (emailIds && emailIds.length > 0) {
      emailContents = await getEmailContentsFromCache(account.id, emailIds);
    }

    const result = await aiEngine.askQuestion(
      question,
      emailContents.map((e) => ({ ...e.content, id: e.id })),
    );

    const data = result as { answer: string; sources: Array<{ emailId: string; subject: string }>; confidence: number };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function groupByTopic(
  emailIds: string[],
): Promise<ActionResult<{ groups: Array<{ topic: string; description: string; emailIds: string[]; confidence: number }>; ungrouped: string[] }>> {
  try {
    const account = await getAccountWithAi();
    const aiEngine = createAiEngine(account);
    const emailContents = await getEmailContentsFromCache(account.id, emailIds);
    const result = await aiEngine.groupByTopic(emailContents.map((e) => ({ ...e.content, id: e.id })));
    const data = result as { groups: Array<{ topic: string; description: string; emailIds: string[]; confidence: number }>; ungrouped: string[] };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
