import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { productInputSchema } from '@ipe/shared';
import { db, schema } from '../db/client.js';

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
  const parsed = productInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [row] = await db.insert(schema.products).values(parsed.data).returning();
  res.status(201).json(serialize(row!));
});

productsRouter.patch('/:id', async (req, res) => {
  const parsed = productInputSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [row] = await db
    .update(schema.products)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.products.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: 'product not found' });
  res.json(serialize(row));
});

/// Once the admin pushes the product onchain via listProduct(), the client posts
/// the resulting tokenId here so future purchases can find it.
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

// bigint isn't valid JSON — coerce for transport.
function serialize(p: typeof schema.products.$inferSelect) {
  return {
    ...p,
    tokenId: p.tokenId?.toString() ?? null,
    priceIpe: p.priceIpe.toString(),
    maxSupply: p.maxSupply.toString(),
  };
}
