import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailAccounts } from '@/server/db/schema';
import { encrypt, decrypt } from '@/lib/crypto';
import { generateId } from '@/lib/utils';
import { disconnectAccount } from '@/lib/emai-client';
import { and, eq } from 'drizzle-orm';

/** Extract non-sensitive fields from decrypted credentials for display */
function safeCredentials(encrypted: string, providerType: string): Record<string, unknown> {
  try {
    const creds = JSON.parse(decrypt(encrypted)) as Record<string, unknown>;
    if (providerType === 'imap') {
      const auth = creds.auth as Record<string, string> | undefined;
      const smtp = creds.smtp as Record<string, unknown> | undefined;
      return {
        host: creds.host,
        port: creds.port,
        user: auth?.user,
        smtpHost: smtp?.host,
        smtpPort: smtp?.port,
      };
    }
    // gmail / outlook — only show clientId (not secret)
    return { clientId: creds.clientId };
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, providerType, credentials, aiAdapter, aiApiKey, aiModel } = body;

    if (!providerType || !credentials) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const id = generateId();
    const credentialsEncrypted = encrypt(JSON.stringify(credentials));

    const values: typeof emailAccounts.$inferInsert = {
      id,
      userId: session.user.id,
      name: name || `${providerType} account`,
      providerType,
      credentialsEncrypted,
      isDefault: true,
    };

    if (aiAdapter && aiApiKey) {
      values.aiAdapter = aiAdapter;
      values.aiApiKeyEncrypted = encrypt(aiApiKey);
      values.aiModel = aiModel || undefined;
    }

    // Set all other accounts as non-default
    db.update(emailAccounts)
      .set({ isDefault: false })
      .where(eq(emailAccounts.userId, session.user.id))
      .run();

    db.insert(emailAccounts).values(values).run();

    return NextResponse.json({ success: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = db
      .select()
      .from(emailAccounts)
      .where(eq(emailAccounts.userId, session.user.id))
      .all();

    const accounts = rows.map((row) => ({
      id: row.id,
      name: row.name,
      providerType: row.providerType,
      isDefault: row.isDefault,
      aiAdapter: row.aiAdapter,
      aiModel: row.aiModel,
      hasAiKey: !!row.aiApiKeyEncrypted,
      ...safeCredentials(row.credentialsEncrypted, row.providerType),
    }));

    return NextResponse.json({ accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    // Verify ownership
    const account = db.select().from(emailAccounts)
      .where(and(eq(emailAccounts.id, id), eq(emailAccounts.userId, session.user.id)))
      .get();
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    db.delete(emailAccounts).where(eq(emailAccounts.id, id)).run();

    // If deleted account was default, promote the first remaining one
    if (account.isDefault) {
      const remaining = db.select().from(emailAccounts)
        .where(eq(emailAccounts.userId, session.user.id))
        .get();
      if (remaining) {
        db.update(emailAccounts).set({ isDefault: true }).where(eq(emailAccounts.id, remaining.id)).run();
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, isDefault, name, providerType, credentials, aiAdapter, aiApiKey, aiModel } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    // Verify ownership
    const account = db.select().from(emailAccounts)
      .where(and(eq(emailAccounts.id, id), eq(emailAccounts.userId, session.user.id)))
      .get();
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (isDefault) {
      db.update(emailAccounts).set({ isDefault: false }).where(eq(emailAccounts.userId, session.user.id)).run();
      db.update(emailAccounts).set({ isDefault: true }).where(eq(emailAccounts.id, id)).run();
    }

    // Update account fields
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (providerType !== undefined) updates.providerType = providerType;
    if (credentials !== undefined) updates.credentialsEncrypted = encrypt(JSON.stringify(credentials));
    if (aiAdapter !== undefined) updates.aiAdapter = aiAdapter;
    if (aiApiKey !== undefined) updates.aiApiKeyEncrypted = encrypt(aiApiKey);
    if (aiModel !== undefined) updates.aiModel = aiModel;

    if (Object.keys(updates).length > 0) {
      db.update(emailAccounts).set(updates).where(eq(emailAccounts.id, id)).run();

      // Invalidate cached emai instance so it reconnects with new config
      if (updates.credentialsEncrypted || updates.aiAdapter || updates.aiApiKeyEncrypted || updates.aiModel) {
        await disconnectAccount(id).catch(() => {});
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
