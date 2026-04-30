import type { Request, Response, NextFunction } from 'express';
import { authenticateAdmin } from '../services/auth.js';

/// Express middleware that verifies a Privy access token and ensures the
/// linked email is on the admin allowlist. Attaches `req.admin` for handlers.
declare module 'express-serve-static-core' {
  interface Request {
    admin?: { email: string; privyUserId: string; adminId: string; name: string };
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });

  try {
    const ctx = await authenticateAdmin(token);
    if (!ctx) return res.status(403).json({ error: 'not an admin' });
    req.admin = ctx;
    next();
  } catch (err) {
    // Verification or DB failure — opaque 401 so we don't leak which step failed.
    console.warn('[auth] admin verification failed:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'invalid or expired session' });
  }
}
