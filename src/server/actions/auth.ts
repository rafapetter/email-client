'use server';

import { db } from '@/lib/db';
import { users, userPreferences } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { signIn } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import { z } from 'zod';

const bcrypt = require('bcryptjs') as typeof import('bcryptjs');

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export async function registerUser(formData: FormData) {
  const raw = {
    name: formData.get('name') as string,
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const { name, email, password } = parsed.data;

  // Check if email already exists
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return { error: 'An account with this email already exists' };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = generateId();

  await db.insert(users).values({ id, email, passwordHash, name }).run();
  await db.insert(userPreferences).values({ id: generateId(), userId: id }).run();

  // Auto sign in
  try {
    await signIn('credentials', { email, password, redirect: false });
    return { success: true };
  } catch {
    return { success: true, message: 'Account created. Please log in.' };
  }
}
