import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createOrderInputSchema, orderStatusEnum } from '@ipe/shared';
import { db, schema } from '../db/client.js';
import { encryptAddress, decryptAddress } from '../crypto.js';

export const ordersRouter = Router();

ordersRouter.post('/', async (req, res) => {
  const parsed = createOrderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, parsed.data.productId) });
  if (!product) return res.status(404).json({ error: 'product not found' });

  const totalPaidIpe = product.priceIpe * BigInt(parsed.data.quantity);
  const [row] = await db
    .insert(schema.orders)
    .values({
      productId: parsed.data.productId,
      buyerAddress: parsed.data.buyerAddress.toLowerCase(),
      quantity: parsed.data.quantity,
      totalPaidIpe,
      txHash: parsed.data.txHash,
      status: 'pending',
      shippingAddressEnc: encryptAddress(parsed.data.shippingAddress),
    })
    .returning();
  res.status(201).json(serializeOrder(row!, false));
});

ordersRouter.get('/by-buyer/:address', async (req, res) => {
  const rows = await db.query.orders.findMany({
    where: eq(schema.orders.buyerAddress, req.params.address.toLowerCase()),
    orderBy: (o, { desc }) => desc(o.createdAt),
  });
  res.json(rows.map((r) => serializeOrder(r, false)));
});

/// Admin endpoints — in production these need real auth (Privy session check
/// against an admin allowlist). For the PoC the routes are unguarded; replace
/// the requireAdmin no-op below with real middleware before mainnet.
ordersRouter.get('/admin', async (_req, res) => {
  const rows = await db.query.orders.findMany({ orderBy: (o, { desc }) => desc(o.createdAt) });
  res.json(rows.map((r) => serializeOrder(r, true)));
});

const patchSchema = z.object({
  status: orderStatusEnum.optional(),
  trackingCode: z.string().max(120).optional(),
});

ordersRouter.patch('/admin/:id', async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [row] = await db
    .update(schema.orders)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.orders.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: 'order not found' });
  res.json(serializeOrder(row, true));
});

function serializeOrder(o: typeof schema.orders.$inferSelect, includeAddress: boolean) {
  return {
    ...o,
    totalPaidIpe: o.totalPaidIpe.toString(),
    blockNumber: o.blockNumber?.toString() ?? null,
    shippingAddressEnc: undefined,
    shippingAddress: includeAddress && o.shippingAddressEnc ? decryptAddress(o.shippingAddressEnc) : undefined,
  };
}
