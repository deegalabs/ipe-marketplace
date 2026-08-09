import { Router } from 'express';
import { eq, asc, and, gt } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const eventsRouter = Router();

/// Public: only active events that haven't ended yet, sorted by upcoming first.
/// The `ends_at > now()` filter makes the cutoff exact regardless of when the
/// eventSweeper last flipped `active` — the sweeper keeps the stored flag in
/// sync for the admin view, this guarantees the buyer never sees a dead event.
eventsRouter.get('/', async (_req, res) => {
  const rows = await db.query.events.findMany({
    where: and(eq(schema.events.active, true), gt(schema.events.endsAt, new Date())),
    orderBy: [asc(schema.events.date)],
  });
  res.json(rows.map(serialize));
});

/// Admin: all events including inactive.
eventsRouter.get('/admin', requireAdmin, async (_req, res) => {
  const rows = await db.query.events.findMany({ orderBy: [asc(schema.events.date)] });
  res.json(rows.map(serialize));
});

const createSchema = z
  .object({
    slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, 'slug must be lowercase, digits, or hyphens'),
    name: z.string().min(1).max(120),
    date: z.string().datetime(),
    endsAt: z.string().datetime(),
    location: z.string().max(200).optional().default(''),
    active: z.boolean().optional().default(true),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.date), {
    message: 'endsAt must be after date',
    path: ['endsAt'],
  });

eventsRouter.post('/admin', requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [row] = await db
      .insert(schema.events)
      .values({ ...parsed.data, date: new Date(parsed.data.date), endsAt: new Date(parsed.data.endsAt) })
      .returning();
    res.status(201).json(serialize(row!));
  } catch (err) {
    if (err instanceof Error && err.message.includes('unique')) {
      return res.status(409).json({ error: 'slug already exists' });
    }
    throw err;
  }
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  date: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  location: z.string().max(200).optional(),
  active: z.boolean().optional(),
});

eventsRouter.patch('/admin/:id', requireAdmin, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.date) update.date = new Date(parsed.data.date);
  if (parsed.data.endsAt) update.endsAt = new Date(parsed.data.endsAt);
  const [row] = await db
    .update(schema.events)
    .set(update)
    .where(eq(schema.events.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: 'event not found' });
  res.json(serialize(row));
});

eventsRouter.delete('/admin/:id', requireAdmin, async (req, res) => {
  const [row] = await db.delete(schema.events).where(eq(schema.events.id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: 'event not found' });
  res.json({ ok: true });
});

function serialize(e: typeof schema.events.$inferSelect) {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    date: e.date.toISOString(),
    endsAt: e.endsAt.toISOString(),
    location: e.location,
    active: e.active,
    createdAt: e.createdAt.toISOString(),
  };
}
