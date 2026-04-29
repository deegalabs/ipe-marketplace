import { Router } from 'express';
import { z } from 'zod';
import { findActiveAdminByEmail, signSession, touchLastLogin, verifyPassword } from '../services/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const adminAuthRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

/// POST /admin/login
/// Body: { email, password }
/// Returns: { token, email, name } on success. Constant-time-ish failure path
/// to slow down brute force (we still hit bcrypt even on missing user via a
/// dummy hash).
const DUMMY_HASH = '$2a$12$0123456789012345678901u9SeL8j8z6ZpjrR9lFOMxzc6YmgX0Z3a'; // bcrypt of nothing useful

adminAuthRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const admin = await findActiveAdminByEmail(parsed.data.email);
  // Compare against either the real hash or a dummy so timing doesn't leak existence.
  const ok = await verifyPassword(parsed.data.password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !ok) return res.status(401).json({ error: 'invalid credentials' });

  await touchLastLogin(admin.id);
  const token = signSession({ sub: admin.id, email: admin.email });
  res.json({ token, email: admin.email, name: admin.name });
});

/// GET /admin/me — returns the session subject if the JWT is valid.
adminAuthRouter.get('/me', requireAdmin, (req, res) => {
  res.json({ email: req.admin!.email, id: req.admin!.id });
});
