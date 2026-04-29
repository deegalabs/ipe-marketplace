import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { productInputSchema } from '@ipe/shared';
import { db, schema } from '../db/client.js';
import { normalizeImageUrl } from '../lib/imageUrl.js';

export const productsRouter = Router();

productsRouter.get('/', async (_req, res) => {
  const rows = await db.query.products.findMany({ orderBy: (p, { asc }) => asc(p.createdAt) });
  res.json(rows.map(serialize));
});

productsRouter.get('/:id', async (req, res) => {
  const row = await db.query.products.findFirst({ where: eq(schema.products.id, req.params.id) });
  if (!row) return res.status(404).json({ error: 'product not found' });
  res.json(serialize(row));
});

productsRouter.post('/', async (req, res) => {
  const parsed = productInputSchema.safeParse(coerceInput(req.body));
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [row] = await db.insert(schema.products).values(toRow(parsed.data) as never).returning();
  res.status(201).json(serialize(row!));
});

productsRouter.patch('/:id', async (req, res) => {
  const parsed = productInputSchema.partial().safeParse(coerceInput(req.body));
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [row] = await db
    .update(schema.products)
    .set({ ...toRow(parsed.data), updatedAt: new Date() } as never)
    .where(eq(schema.products.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: 'product not found' });
  res.json(serialize(row));
});

/// Convert bigint fields to strings so drizzle's numeric(78,0) accepts them at runtime,
/// and normalize image URLs so Google Drive share links become loadable image URLs.
function toRow<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const k of ['priceIpe', 'priceUsdc', 'maxSupply']) {
    if (typeof out[k] === 'bigint') out[k] = (out[k] as bigint).toString();
  }
  if (typeof out.imageUrl === 'string') {
    out.imageUrl = normalizeImageUrl(out.imageUrl);
  }
  return out;
}

productsRouter.post('/:id/token', async (req, res) => {
  const tokenId = BigInt(req.body?.tokenId);
  const [row] = await db
    .update(schema.products)
    .set({ tokenId, updatedAt: new Date() })
    .where(eq(schema.products.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: 'product not found' });
  res.json(serialize(row));
});

/// Coerce stringified bigints from JSON into bigint before zod validates,
/// since JSON has no native bigint and the client sends them as strings.
function coerceInput(body: Record<string, unknown> | undefined) {
  if (!body) return body;
  const out: Record<string, unknown> = { ...body };
  for (const k of ['priceIpe', 'priceUsdc', 'priceBrl', 'maxSupply']) {
    if (typeof out[k] === 'string' && out[k] !== '') out[k] = BigInt(out[k] as string);
  }
  return out;
}

function serialize(p: typeof schema.products.$inferSelect) {
  return {
    ...p,
    tokenId: p.tokenId?.toString() ?? null,
    /// numeric columns are already string (drizzle 0.39); pass through as-is.
    priceIpe: p.priceIpe,
    priceUsdc: p.priceUsdc,
    priceBrl: p.priceBrl.toString(),
    maxSupply: p.maxSupply,
  };
}
