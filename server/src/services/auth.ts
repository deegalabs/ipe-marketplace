import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { env } from '../env.js';

interface JwtPayload {
  sub: string;     // admin user id
  email: string;
  iat: number;
  exp: number;
}

const SESSION_TTL_HOURS = 12;
const BCRYPT_COST = 12;

function secret(): string {
  if (env.ADMIN_JWT_SECRET) return env.ADMIN_JWT_SECRET;
  // Dev fallback so local boot doesn't fail. Loud warning so we notice.
  console.warn('[auth] ADMIN_JWT_SECRET not set — using insecure dev fallback');
  return 'dev-only-insecure-secret-do-not-use-in-prod';
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signSession(payload: { sub: string; email: string }): string {
  return jwt.sign(payload, secret(), { expiresIn: `${SESSION_TTL_HOURS}h` });
}

export function verifySession(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, secret()) as JwtPayload;
  } catch {
    return null;
  }
}

/// Tries the magic boot path: if ADMIN_INITIAL_EMAIL/PASSWORD are set and the
/// email isn't yet in admin_users, create the row. Idempotent — safe to run on
/// every boot. Lets a fresh deploy come up with a usable admin without a CLI.
export async function ensureBootstrapAdmin() {
  if (!env.ADMIN_INITIAL_EMAIL || !env.ADMIN_INITIAL_PASSWORD) return;
  const email = env.ADMIN_INITIAL_EMAIL.toLowerCase();
  const existing = await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.email, email) });
  if (existing) return;
  const passwordHash = await hashPassword(env.ADMIN_INITIAL_PASSWORD);
  await db.insert(schema.adminUsers).values({ email, passwordHash, name: 'bootstrap' });
  console.log(`[auth] bootstrap admin "${email}" created`);
}

export async function findActiveAdminByEmail(email: string) {
  const row = await db.query.adminUsers.findFirst({
    where: eq(schema.adminUsers.email, email.toLowerCase()),
  });
  if (!row || !row.active) return null;
  return row;
}

export async function touchLastLogin(adminId: string) {
  await db
    .update(schema.adminUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(schema.adminUsers.id, adminId));
}
