import type { Request, Response, NextFunction } from 'express';
import { verifySession } from '../services/auth.js';

/// Express middleware that gates a route behind a valid admin JWT.
/// Attaches `req.admin` with `{ id, email }` so handlers can use it.
declare module 'express-serve-static-core' {
  interface Request {
    admin?: { id: string; email: string };
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  const payload = verifySession(token);
  if (!payload) return res.status(401).json({ error: 'invalid or expired session' });
  req.admin = { id: payload.sub, email: payload.email };
  next();
}
