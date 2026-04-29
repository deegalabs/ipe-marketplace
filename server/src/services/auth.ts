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
  if (env.ADMIN_JWT_SECRET && env.ADMIN_JWT_SECRET.length >= 32) {
    return env.ADMIN_JWT_SECRET;
  }
  // Hard fail rather than silently signing tokens with a guessable string.
  // env.ts already enforces this in production; this guard catches dev misconfig too.
  throw new Error(
    'ADMIN_JWT_SECRET is missing or too short (need 32+ chars). Generate with: openssl rand -base64 48',
  );
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
  if (existing) {
    // Common confusion: rotating ADMIN_INITIAL_PASSWORD has no effect once the
    // admin row exists. Log loudly so it's not a silent gotcha.
    console.log(`[auth] bootstrap admin "${email}" already exists — ADMIN_INITIAL_PASSWORD is ignored`);
    return;
  }
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
