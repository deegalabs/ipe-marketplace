import { PrivyClient } from '@privy-io/server-auth';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { env } from '../env.js';

/// Lazily-initialized Privy client. We don't fail at boot time if the keys are
/// missing — env.ts already enforces that in production. In dev, server still
/// starts but admin routes return 503 until keys are set.
let _privy: PrivyClient | null = null;
function privyClient(): PrivyClient {
  if (_privy) return _privy;
  if (!env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET) {
    throw new Error('Privy not configured (PRIVY_APP_ID + PRIVY_APP_SECRET required for admin auth)');
  }
  _privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET);
  return _privy;
}

interface AdminContext {
  email: string;
  privyUserId: string;
  adminId: string;
  name: string;
}

/// Verifies a Privy access token, looks up the linked email, and checks the
/// admin allowlist. Returns the admin row if access is granted, null otherwise.
/// Throws on Privy SDK / DB errors so the caller can return 5xx.
export async function authenticateAdmin(token: string): Promise<AdminContext | null> {
  const claims = await privyClient().verifyAuthToken(token);
  // Pull the user to read their linked email (claims only carry the user id).
  const user = await privyClient().getUserById(claims.userId);
  const emails = collectEmails(user);

  if (emails.length === 0) return null;

  // Email matching is case-insensitive — Privy stores normalized addresses but
  // we lowercase here as a belt-and-suspenders against typos in the allowlist.
  for (const email of emails) {
    const row = await db.query.adminUsers.findFirst({
      where: eq(schema.adminUsers.email, email.toLowerCase()),
    });
    if (row && row.active) {
      return {
        email: row.email,
        privyUserId: claims.userId,
        adminId: row.id,
        name: row.name,
      };
    }
  }
  return null;
}

/// All emails on a Privy account: the primary email login plus any linked
/// email accounts. Privy returns these in different shapes; we normalize.
function collectEmails(user: Awaited<ReturnType<PrivyClient['getUserById']>>): string[] {
  const out = new Set<string>();
  if (user.email?.address) out.add(user.email.address);
  for (const acc of user.linkedAccounts ?? []) {
    if (acc.type === 'email' && 'address' in acc && typeof acc.address === 'string') {
      out.add(acc.address);
    }
  }
  return [...out];
}

/// On boot, if ADMIN_INITIAL_EMAIL is set and not yet in admin_users, add it.
/// Idempotent — safe to run on every boot. Replaces the old bootstrap-with-password.
export async function ensureBootstrapAdmin() {
  if (!env.ADMIN_INITIAL_EMAIL) return;
  const email = env.ADMIN_INITIAL_EMAIL.toLowerCase();
  const existing = await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.email, email) });
  if (existing) {
    console.log(`[auth] bootstrap admin "${email}" already in allowlist`);
    return;
  }
  await db.insert(schema.adminUsers).values({ email, name: 'bootstrap', active: true });
  console.log(`[auth] bootstrap admin "${email}" added to allowlist`);
}
