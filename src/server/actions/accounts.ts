'use server';

import { auth } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { disconnectAccount } from '@/lib/emai-client';
import { emailAccounts, userPreferences } from '@/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { generateId } from '@/lib/utils';
import type { EmailAccount } from '@/types';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  return session.user.id;
}

export async function getAccounts(): Promise<ActionResult<EmailAccount[]>> {
  try {
    const userId = await requireUserId();

    const accounts = await db
      .select({
        id: emailAccounts.id,
        name: emailAccounts.name,
        providerType: emailAccounts.providerType,
        isDefault: emailAccounts.isDefault,
        aiAdapter: emailAccounts.aiAdapter,
      })
      .from(emailAccounts)
      .where(eq(emailAccounts.userId, userId))
      .all();

    const serialized: EmailAccount[] = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      providerType: a.providerType,
      isDefault: a.isDefault,
      hasAi: a.aiAdapter != null,
    }));

    return { success: true, data: serialized };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createAccount(formData: FormData): Promise<ActionResult<EmailAccount>> {
  try {
    const userId = await requireUserId();

    const name = formData.get('name') as string | null;
    const providerType = formData.get('providerType') as string | null;
    const credentials = formData.get('credentials') as string | null;
    const aiAdapter = formData.get('aiAdapter') as string | null;
    const aiApiKey = formData.get('aiApiKey') as string | null;
    const aiModel = formData.get('aiModel') as string | null;

    if (!name || !providerType || !credentials) {
      return { success: false, error: 'Missing required fields: name, providerType, credentials' };
    }

    // Validate credentials is valid JSON
    try {
      JSON.parse(credentials);
    } catch {
      return { success: false, error: 'Credentials must be valid JSON' };
    }

    const id = randomUUID();
    const credentialsEncrypted = encrypt(credentials);
    const aiApiKeyEncrypted = aiApiKey ? encrypt(aiApiKey) : null;

    // Check if this is the first account (make it default)
    const existingCount = (await db
      .select({ id: emailAccounts.id })
      .from(emailAccounts)
      .where(eq(emailAccounts.userId, userId))
      .all()).length;

    const isDefault = existingCount === 0;

    await db.insert(emailAccounts)
      .values({
        id,
        userId,
        name,
        providerType,
        credentialsEncrypted,
        aiAdapter,
        aiApiKeyEncrypted,
        aiModel,
        isDefault,
      })
      .run();

    return {
      success: true,
      data: {
        id,
        name,
        providerType,
        isDefault,
        hasAi: aiAdapter != null,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteAccount(id: string): Promise<ActionResult<void>> {
  try {
    const userId = await requireUserId();

    // Verify the account belongs to the user
    const account = await db
      .select()
      .from(emailAccounts)
      .where(and(eq(emailAccounts.id, id), eq(emailAccounts.userId, userId)))
      .get();

    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    // Disconnect the emai instance if active
    await disconnectAccount(id);

    // Delete from DB
    await db.delete(emailAccounts)
      .where(and(eq(emailAccounts.id, id), eq(emailAccounts.userId, userId)))
      .run();

    // If this was the default account, promote another one
    if (account.isDefault) {
      const remaining = await db
        .select()
        .from(emailAccounts)
        .where(eq(emailAccounts.userId, userId))
        .all();

      if (remaining.length > 0) {
        await db.update(emailAccounts)
          .set({ isDefault: true })
          .where(eq(emailAccounts.id, remaining[0].id))
          .run();
      }
    }

    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getAiPreferences(): Promise<ActionResult<{
  aiSummariesEnabled: boolean;
  aiPriorityEnabled: boolean;
  aiClassificationEnabled: boolean;
  focusedInboxEnabled: boolean;
}>> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error('Not authenticated');

    let prefs = await db.select().from(userPreferences).where(eq(userPreferences.userId, session.user.id)).get();
    if (!prefs) {
      // Create default preferences
      const id = generateId();
      await db.insert(userPreferences).values({ id, userId: session.user.id }).run();
      prefs = await db.select().from(userPreferences).where(eq(userPreferences.userId, session.user.id)).get();
    }

    return {
      success: true,
      data: {
        aiSummariesEnabled: prefs!.aiSummariesEnabled,
        aiPriorityEnabled: prefs!.aiPriorityEnabled,
        aiClassificationEnabled: prefs!.aiClassificationEnabled,
        focusedInboxEnabled: prefs!.focusedInboxEnabled,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateAiPreferences(updates: {
  aiSummariesEnabled?: boolean;
  aiPriorityEnabled?: boolean;
  aiClassificationEnabled?: boolean;
  focusedInboxEnabled?: boolean;
}): Promise<ActionResult<void>> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error('Not authenticated');

    let prefs = await db.select().from(userPreferences).where(eq(userPreferences.userId, session.user.id)).get();
    if (!prefs) {
      const id = generateId();
      await db.insert(userPreferences).values({ id, userId: session.user.id }).run();
    }

    await db.update(userPreferences).set(updates).where(eq(userPreferences.userId, session.user.id)).run();
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function setDefaultAccount(id: string): Promise<ActionResult<void>> {
  try {
    const userId = await requireUserId();

    // Verify the account belongs to the user
    const account = await db
      .select()
      .from(emailAccounts)
      .where(and(eq(emailAccounts.id, id), eq(emailAccounts.userId, userId)))
      .get();

    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    // Unset all defaults for this user
    await db.update(emailAccounts)
      .set({ isDefault: false })
      .where(eq(emailAccounts.userId, userId))
      .run();

    // Set the new default
    await db.update(emailAccounts)
      .set({ isDefault: true })
      .where(eq(emailAccounts.id, id))
      .run();

    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
