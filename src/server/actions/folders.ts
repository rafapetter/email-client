'use server';

import { auth } from '@/lib/auth';
import { getEmaiForAccount } from '@/lib/emai-client';
import { db } from '@/lib/db';
import { emailAccounts } from '@/server/db/schema';
import { and, eq } from 'drizzle-orm';
import type { SerializedFolder } from '@/types';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function getEmai() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const account = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.userId, session.user.id), eq(emailAccounts.isDefault, true)))
    .get();

  if (!account) throw new Error('No email account connected');
  return getEmaiForAccount(account.id);
}

function serializeFolder(raw: unknown): SerializedFolder {
  const folder = raw as Record<string, unknown>;
  return {
    id: String(folder.id ?? ''),
    name: String(folder.name ?? ''),
    type: folder.type != null ? String(folder.type) : undefined,
    unreadCount: typeof folder.unreadCount === 'number' ? folder.unreadCount : undefined,
    totalCount: typeof folder.totalCount === 'number' ? folder.totalCount : undefined,
  };
}

export async function listFolders(): Promise<ActionResult<SerializedFolder[]>> {
  try {
    const emai = await getEmai();
    const result = await emai.folders.list();
    // emai SDK may return array directly or { items: [...] }
    let parsed: unknown[];
    if (Array.isArray(result)) {
      parsed = result;
    } else if (result && typeof result === 'object' && 'items' in (result as Record<string, unknown>)) {
      parsed = (result as { items: unknown[] }).items;
    } else {
      parsed = [];
    }
    return { success: true, data: parsed.map(serializeFolder) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getFolderCounts(): Promise<
  ActionResult<{ counts: Record<string, { unread: number; total: number }>; pathMap: Record<string, string> }>
> {
  try {
    const emai = await getEmai();
    const result = await emai.folders.list();

    // emai SDK may return array directly or { items: [...] }
    let parsed: Array<Record<string, unknown>>;
    if (Array.isArray(result)) {
      parsed = result as Array<Record<string, unknown>>;
    } else if (result && typeof result === 'object' && 'items' in result) {
      parsed = (result as { items: unknown[] }).items as Array<Record<string, unknown>>;
    } else {
      parsed = [];
    }

    const counts: Record<string, { unread: number; total: number }> = {};
    const pathMap: Record<string, string> = {};

    // Map common IMAP / Gmail folder names to simple uppercase keys
    const FOLDER_NAME_MAP: Record<string, string> = {
      'inbox': 'INBOX',
      '[gmail]/all mail': 'ALL MAIL',
      '[gmail]/sent mail': 'SENT',
      '[gmail]/drafts': 'DRAFTS',
      '[gmail]/spam': 'SPAM',
      '[gmail]/trash': 'TRASH',
      '[gmail]/starred': 'STARRED',
      '[gmail]/important': 'IMPORTANT',
      'sent': 'SENT',
      'sent items': 'SENT',
      'drafts': 'DRAFTS',
      'draft': 'DRAFTS',
      'trash': 'TRASH',
      'deleted items': 'TRASH',
      'junk': 'SPAM',
      'junk email': 'SPAM',
      'spam': 'SPAM',
      'archive': 'ARCHIVE',
      'starred': 'STARRED',
    };

    console.log('[Folders] Raw result type:', typeof result, Array.isArray(result) ? 'array' : 'object');
    console.log('[Folders] Raw folder list from IMAP:', JSON.stringify(parsed.map((f) => {
      // Log all keys to discover the actual shape
      const keys = Object.keys(f);
      return { keys, name: f.name, id: f.id, path: f.path, unread: f.unreadCount, total: f.totalCount, messages: f.messages, unseen: f.unseen, status: f.status };
    }), null, 2));

    for (const folder of parsed) {
      // Try name first, then id, then path — IMAP providers differ
      const rawName = String(folder.name ?? folder.id ?? '');
      const rawPath = String(folder.path ?? folder.id ?? '');
      const normalized = FOLDER_NAME_MAP[rawName.toLowerCase()]
        ?? FOLDER_NAME_MAP[rawPath.toLowerCase()]
        ?? rawName.toUpperCase();
      // IMAP may use different property names: unreadCount, unseen, unread
      const unread = typeof folder.unreadCount === 'number' ? folder.unreadCount
        : typeof folder.unseen === 'number' ? folder.unseen
        : typeof folder.unread === 'number' ? folder.unread
        : 0;
      const total = typeof folder.totalCount === 'number' ? folder.totalCount
        : typeof folder.messages === 'number' ? folder.messages
        : typeof folder.total === 'number' ? folder.total
        : 0;
      counts[normalized] = { unread, total };
      // Store the actual IMAP path so we can pass it to listEmails
      pathMap[normalized] = rawPath;
    }

    console.log('[Folders] Normalized counts:', counts);
    console.log('[Folders] Path map:', pathMap);

    return { success: true, data: { counts, pathMap } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
