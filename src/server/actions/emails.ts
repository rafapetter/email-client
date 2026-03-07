'use server';

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { auth } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { getEmaiForAccount } from '@/lib/emai-client';
import { db } from '@/lib/db';
import { emailAccounts, cachedEmails } from '@/server/db/schema';
import { and, eq } from 'drizzle-orm';
import type { SerializedEmail } from '@/types';
import { getLocalEmails, getLocalEmail, syncEmails } from './email-sync';

// Load AiEngine for AI writing helpers (no IMAP needed)
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

async function getAccountAndEmai() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const account = db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.userId, session.user.id), eq(emailAccounts.isDefault, true)))
    .get();

  if (!account) throw new Error('No email account connected');
  const emai = await getEmaiForAccount(account.id);
  return { emai, accountId: account.id };
}

async function getEmai() {
  const { emai } = await getAccountAndEmai();
  return emai;
}

async function getAiEngine() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const account = db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.userId, session.user.id), eq(emailAccounts.isDefault, true)))
    .get();

  if (!account) throw new Error('No email account connected');
  if (!account.aiAdapter || !account.aiApiKeyEncrypted) throw new Error('No AI configured');

  return new AiEngine({
    adapter: account.aiAdapter,
    apiKey: decrypt(account.aiApiKeyEncrypted),
    ...(account.aiModel && { model: account.aiModel }),
  });
}

export async function listEmails(
  options?: { folder?: string; limit?: number; offset?: number },
): Promise<ActionResult<{ emails: SerializedEmail[]; total: number }>> {
  try {
    const folder = options?.folder ?? 'INBOX';
    const limit = options?.limit ?? 50;

    // Try local DB first (instant)
    const localResult = await getLocalEmails(folder, limit, options?.offset ?? 0);
    if (localResult.success && localResult.data.emails.length > 0) {
      // Trigger background IMAP sync (fire-and-forget)
      syncEmails(folder, limit).catch((err) => {
        console.warn('[listEmails] Background sync failed:', err);
      });
      return localResult;
    }

    // No local data — do initial IMAP sync
    const syncResult = await syncEmails(folder, limit);
    if (!syncResult.success) {
      return { success: false, error: syncResult.error };
    }

    // Now read from local DB
    return await getLocalEmails(folder, limit, options?.offset ?? 0);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getEmail(id: string): Promise<ActionResult<SerializedEmail>> {
  try {
    return await getLocalEmail(id);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendEmail(data: {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
}): Promise<ActionResult<{ id: string; threadId?: string; messageId: string }>> {
  try {
    const emai = await getEmai();
    const result = await emai.emails.send(data);
    const parsed = result as { id: string; threadId?: string; messageId: string };
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function replyToEmail(
  emailId: string,
  data: { text?: string; html?: string },
): Promise<ActionResult<{ id: string; threadId?: string; messageId: string }>> {
  try {
    const emai = await getEmai();
    const result = await emai.emails.reply(emailId, data);
    const parsed = result as { id: string; threadId?: string; messageId: string };
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function forwardEmail(
  emailId: string,
  to: string[],
): Promise<ActionResult<{ id: string; threadId?: string; messageId: string }>> {
  try {
    const emai = await getEmai();
    const result = await emai.emails.forward(emailId, { to });
    const parsed = result as { id: string; threadId?: string; messageId: string };
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function archiveEmail(id: string): Promise<ActionResult<void>> {
  try {
    const emai = await getEmai();
    await emai.emails.archive(id);
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteEmail(id: string): Promise<ActionResult<void>> {
  try {
    const emai = await getEmai();
    await emai.emails.delete(id);
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function starEmail(id: string): Promise<ActionResult<void>> {
  try {
    const { emai, accountId } = await getAccountAndEmai();
    await emai.emails.star(id);
    // Update local cache
    db.update(cachedEmails).set({ isStarred: true, updatedAt: new Date() })
      .where(and(eq(cachedEmails.accountId, accountId), eq(cachedEmails.id, id))).run();
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function unstarEmail(id: string): Promise<ActionResult<void>> {
  try {
    const { emai, accountId } = await getAccountAndEmai();
    await emai.emails.unstar(id);
    db.update(cachedEmails).set({ isStarred: false, updatedAt: new Date() })
      .where(and(eq(cachedEmails.accountId, accountId), eq(cachedEmails.id, id))).run();
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function markAsRead(id: string): Promise<ActionResult<void>> {
  try {
    const { emai, accountId } = await getAccountAndEmai();
    await emai.emails.markAsRead(id);
    // Update local cache
    db.update(cachedEmails).set({ isRead: true, updatedAt: new Date() })
      .where(and(eq(cachedEmails.accountId, accountId), eq(cachedEmails.id, id))).run();
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function markAsUnread(id: string): Promise<ActionResult<void>> {
  try {
    const { emai, accountId } = await getAccountAndEmai();
    await emai.emails.markAsUnread(id);
    db.update(cachedEmails).set({ isRead: false, updatedAt: new Date() })
      .where(and(eq(cachedEmails.accountId, accountId), eq(cachedEmails.id, id))).run();
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// AI-powered composition helpers (use AiEngine directly — no IMAP needed)

export async function improveWriting(text: string): Promise<string> {
  const aiEngine = await getAiEngine();
  return await aiEngine.improveWriting(text) as string;
}

export async function changeTone(
  text: string,
  tone: 'formal' | 'casual' | 'friendly' | 'professional',
): Promise<string> {
  const aiEngine = await getAiEngine();
  return await aiEngine.rewriteInTone(text, tone) as string;
}

export async function aiCompose(instructions: string): Promise<string> {
  const aiEngine = await getAiEngine();
  const result = await aiEngine.composeEmail({ instructions }) as { text?: string; subject?: string };
  return result.text ?? '';
}
