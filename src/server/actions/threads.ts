'use server';

import { auth } from '@/lib/auth';
import { getEmaiForAccount } from '@/lib/emai-client';
import { db } from '@/lib/db';
import { emailAccounts } from '@/server/db/schema';
import { and, eq } from 'drizzle-orm';
import type { SerializedEmail } from '@/types';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

interface SerializedThread {
  id: string;
  subject: string;
  emails: SerializedEmail[];
  participants: Array<{ name?: string; address: string }>;
  messageCount: number;
  lastMessageDate: string;
}

async function getEmai() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const account = db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.userId, session.user.id), eq(emailAccounts.isDefault, true)))
    .get();

  if (!account) throw new Error('No email account connected');
  return getEmaiForAccount(account.id);
}

function serializeEmail(raw: unknown): SerializedEmail {
  const email = raw as Record<string, unknown>;
  const from = email.from as { name?: string; address: string } | null | undefined;
  const to = email.to as Array<{ name?: string; address: string }> | undefined;
  const cc = email.cc as Array<{ name?: string; address: string }> | undefined;
  const body = email.body as { text?: string; html?: string } | undefined;
  const attachments = (email.attachments as Array<Record<string, unknown>> | undefined) ?? [];

  return {
    id: String(email.id ?? ''),
    subject: String(email.subject ?? ''),
    from: from ?? null,
    to: to ?? [],
    cc: cc,
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
  };
}

function serializeThread(raw: unknown): SerializedThread {
  const thread = raw as Record<string, unknown>;
  const emails = (thread.emails ?? thread.messages ?? []) as unknown[];
  const participants = (thread.participants ?? []) as Array<{ name?: string; address: string }>;

  const serializedEmails = emails.map(serializeEmail);

  return {
    id: String(thread.id ?? ''),
    subject: String(thread.subject ?? ''),
    emails: serializedEmails,
    participants: participants.map((p) => ({
      name: p.name,
      address: String(p.address ?? ''),
    })),
    messageCount:
      typeof thread.messageCount === 'number' ? thread.messageCount : serializedEmails.length,
    lastMessageDate:
      thread.lastMessageDate instanceof Date
        ? thread.lastMessageDate.toISOString()
        : String(thread.lastMessageDate ?? serializedEmails[serializedEmails.length - 1]?.date ?? ''),
  };
}

export async function listThreads(
  options?: { limit?: number },
): Promise<ActionResult<SerializedThread[]>> {
  try {
    const emai = await getEmai();
    // The SDK does not have threads.list — fetch emails and use threads.detect
    const limit = options?.limit ?? 50;
    const result = await emai.emails.list({ limit: limit * 3 });
    const parsed = result as { items: unknown[] };

    // Use the SDK thread detector to group emails into threads
    // Since threads.detect expects Email objects, pass through serialization round-trip
    const items = parsed.items ?? [];
    const threads = emai.threads.detect(items as Parameters<typeof emai.threads.detect>[0]);
    const serialized = threads as unknown[];

    return {
      success: true,
      data: serialized.slice(0, limit).map(serializeThread),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getThread(id: string): Promise<ActionResult<SerializedThread>> {
  try {
    const emai = await getEmai();
    const result = await emai.threads.get(id);
    const parsed = result as unknown;
    return { success: true, data: serializeThread(parsed) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
