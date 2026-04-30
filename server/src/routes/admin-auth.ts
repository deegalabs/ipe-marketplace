import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const adminAuthRouter = Router();

/// GET /admin/me — returns the admin context if the Privy token is valid AND
/// the email is in the allowlist. The frontend hits this on /admin to decide
/// between rendering the dashboard or showing "not authorized".
adminAuthRouter.get('/me', requireAdmin, (req, res) => {
  res.json({
    email: req.admin!.email,
    name: req.admin!.name,
    adminId: req.admin!.adminId,
  });
});

// ─── Admin allowlist management ───────────────────────────────────────

const upsertSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  active: z.boolean().optional(),
});

adminAuthRouter.get('/admins', requireAdmin, async (_req, res) => {
  const rows = await db.query.adminUsers.findMany({ orderBy: (a, { asc }) => asc(a.createdAt) });
  res.json(rows);
});

adminAuthRouter.post('/admins', requireAdmin, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const email = parsed.data.email.toLowerCase();
  const existing = await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.email, email) });
  if (existing) {
    // Re-enable if previously deactivated, or no-op if already active.
    if (!existing.active || (parsed.data.name && existing.name !== parsed.data.name)) {
      const [updated] = await db
        .update(schema.adminUsers)
        .set({ active: true, name: parsed.data.name ?? existing.name })
        .where(eq(schema.adminUsers.id, existing.id))
        .returning();
      return res.json(updated);
    }
    return res.json(existing);
  }
  const [row] = await db
    .insert(schema.adminUsers)
    .values({ email, name: parsed.data.name ?? '', active: parsed.data.active ?? true })
    .returning();
  res.status(201).json(row);
});

adminAuthRouter.patch('/admins/:id', requireAdmin, async (req, res) => {
  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [row] = await db
    .update(schema.adminUsers)
    .set(parsed.data)
    .where(eq(schema.adminUsers.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: 'admin not found' });
  res.json(row);
});

/// Soft delete via active=false. Refusing to delete the caller themselves so
/// an admin can't accidentally lock everyone out.
adminAuthRouter.delete('/admins/:id', requireAdmin, async (req, res) => {
  if (req.admin!.adminId === req.params.id) {
    return res.status(400).json({ error: "you can't deactivate yourself — ask another admin" });
  }
  const [row] = await db
    .update(schema.adminUsers)
    .set({ active: false })
    .where(eq(schema.adminUsers.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: 'admin not found' });
  res.json(row);
});
