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

  const unit = priceFor(product, parsed.data.paymentMethod);
  if (unit === 0n) return res.status(400).json({ error: 'payment method not enabled for this product' });
  const totalPaid = unit * BigInt(parsed.data.quantity);

  const initialStatus = parsed.data.paymentMethod === 'pix' ? 'awaiting_payment' : 'pending';

  const [row] = await db
    .insert(schema.orders)
    .values({
      productId: parsed.data.productId,
      buyerAddress: parsed.data.buyerAddress.toLowerCase(),
      quantity: parsed.data.quantity,
      paymentMethod: parsed.data.paymentMethod,
      paymentTokenAddress: parsed.data.paymentTokenAddress?.toLowerCase() ?? null,
      totalPaid: totalPaid.toString(),
      paymentRef: parsed.data.paymentRef,
      status: initialStatus,
      deliveryMethod: parsed.data.deliveryMethod,
      shippingAddressEnc: parsed.data.shippingAddress ? encryptAddress(parsed.data.shippingAddress) : null,
      pickupEventId: parsed.data.pickup?.eventId ?? null,
      pickupDisplayName: parsed.data.pickup?.displayName ?? null,
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

function priceFor(p: typeof schema.products.$inferSelect, method: 'ipe' | 'usdc' | 'pix'): bigint {
  switch (method) {
    case 'ipe': return BigInt(p.priceIpe);
    case 'usdc': return BigInt(p.priceUsdc);
    case 'pix': return p.priceBrl;
  }
}

function serializeOrder(o: typeof schema.orders.$inferSelect, includePII: boolean) {
  return {
    id: o.id,
    productId: o.productId,
    buyerAddress: o.buyerAddress,
    quantity: o.quantity,
    paymentMethod: o.paymentMethod,
    paymentTokenAddress: o.paymentTokenAddress,
    totalPaid: o.totalPaid,
    paymentRef: o.paymentRef,
    blockNumber: o.blockNumber?.toString() ?? null,
    status: o.status,
    deliveryMethod: o.deliveryMethod,
    shippingAddress: includePII && o.shippingAddressEnc ? decryptAddress(o.shippingAddressEnc) : null,
    pickup: o.pickupEventId
      ? { eventId: o.pickupEventId, displayName: o.pickupDisplayName ?? '' }
      : null,
    trackingCode: o.trackingCode,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}
