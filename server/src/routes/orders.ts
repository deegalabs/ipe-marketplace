import { Router } from 'express';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { createDirectOrderInputSchema, orderStatusEnum } from '@ipe/shared';
import { db, schema } from '../db/client.js';
import { encryptAddress, decryptAddress } from '../crypto.js';
import {
  sendAdminNewOrder,
  sendOrderShipped,
  sendOrderReadyForPickup,
  sendOrderDelivered,
} from '../services/email.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const ordersRouter = Router();

ordersRouter.post('/', async (req, res) => {
  const parsed = createDirectOrderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, parsed.data.productId) });
  if (!product) return res.status(404).json({ error: 'product not found' });

  const unit = priceFor(product, parsed.data.paymentMethod);
  if (unit === 0n) return res.status(400).json({ error: 'payment method not enabled for this product' });
  const totalPaid = unit * BigInt(parsed.data.quantity);

  const [row] = await db
    .insert(schema.orders)
    .values({
      productId: parsed.data.productId,
      buyerAddress: parsed.data.buyerAddress.toLowerCase(),
      customerEmail: parsed.data.customerEmail ?? null,
      quantity: parsed.data.quantity,
      paymentMethod: parsed.data.paymentMethod,
      paymentProvider: 'direct',
      paymentTokenAddress: parsed.data.paymentTokenAddress.toLowerCase(),
      totalPaid: totalPaid.toString(),
      paymentRef: parsed.data.paymentRef,
      status: 'pending',
      deliveryMethod: parsed.data.deliveryMethod,
      shippingAddressEnc: parsed.data.shippingAddress ? encryptAddress(parsed.data.shippingAddress) : null,
      pickupEventId: parsed.data.pickup?.eventId ?? null,
      pickupDisplayName: parsed.data.pickup?.displayName ?? null,
    })
    .returning();
  if (row) void sendAdminNewOrder(row, product);
  res.status(201).json(serializeOrder(row!, false));
});

ordersRouter.get('/by-buyer/:address', async (req, res) => {
  const rows = await db.query.orders.findMany({
    where: eq(schema.orders.buyerAddress, req.params.address.toLowerCase()),
    orderBy: (o, { desc }) => desc(o.createdAt),
  });
  res.json(rows.map((r) => serializeOrder(r, false)));
});

ordersRouter.get('/admin', requireAdmin, async (_req, res) => {
  const rows = await db.query.orders.findMany({ orderBy: (o, { desc }) => desc(o.createdAt) });
  res.json(rows.map((r) => serializeOrder(r, true)));
});

const patchSchema = z.object({
  status: orderStatusEnum.optional(),
  trackingCode: z.string().max(120).optional(),
});

ordersRouter.patch('/admin/:id', requireAdmin, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [row] = await db
    .update(schema.orders)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.orders.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: 'order not found' });

  // Status transition emails (best-effort).
  if (parsed.data.status) {
    const product = await db.query.products.findFirst({ where: eq(schema.products.id, row.productId) });
    if (product) {
      if (parsed.data.status === 'shipped') {
        if (row.deliveryMethod === 'pickup') void sendOrderReadyForPickup(row, product);
        else void sendOrderShipped(row, product);
      } else if (parsed.data.status === 'delivered') {
        void sendOrderDelivered(row, product);
      }
    }
  }

  res.json(serializeOrder(row, true));
});

/// Public cancel — buyer initiated. Idempotent + race-safe: the UPDATE only
/// succeeds while the order is still pre-paid, so a webhook landing in the
/// same millisecond as the cancel will either flip status to 'paid' first
/// (cancel becomes a no-op returning 409) or after (cancel wins and the
/// webhook's claim UPDATE finds nothing — payment gets ignored).
///
/// Auth model: order IDs are unguessable UUIDs and are only surfaced to the
/// buyer (My Orders, post-checkout polling), so knowing the ID is treated as
/// authorization for cancel. No wallet signature required — most gateway
/// orders don't have a wallet attached.
ordersRouter.post('/:id/cancel', async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'not found' });
  }
  const [updated] = await db
    .update(schema.orders)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(schema.orders.id, req.params.id),
        inArray(schema.orders.status, ['pending', 'awaiting_payment'] as const),
      ),
    )
    .returning();
  if (!updated) {
    // Either the order doesn't exist or it's already past the pre-paid window.
    const existing = await db.query.orders.findFirst({ where: eq(schema.orders.id, req.params.id) });
    if (!existing) return res.status(404).json({ error: 'not found' });
    return res.status(409).json({ error: `cannot cancel order with status '${existing.status}'` });
  }
  res.json(serializeOrder(updated, false));
});

/// Public lookup for an order by id (used by the gateway flow to poll status while
/// awaiting payment). Declared LAST so static segments like /admin and /by-buyer
/// take precedence; the regex check is a defense in depth.
ordersRouter.get('/:id', async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'not found' });
  }
  const row = await db.query.orders.findFirst({ where: eq(schema.orders.id, req.params.id) });
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(serializeOrder(row, false));
});

function priceFor(p: typeof schema.products.$inferSelect, method: 'ipe' | 'usdc'): bigint {
  switch (method) {
    case 'ipe': return BigInt(p.priceIpe);
    case 'usdc': return BigInt(p.priceUsdc);
  }
}

function serializeOrder(o: typeof schema.orders.$inferSelect, includePII: boolean) {
  return {
    id: o.id,
    productId: o.productId,
    buyerAddress: o.buyerAddress,
    customerEmail: includePII ? o.customerEmail : null,
    quantity: o.quantity,
    paymentMethod: o.paymentMethod,
    paymentProvider: o.paymentProvider,
    paymentTokenAddress: o.paymentTokenAddress,
    totalPaid: o.totalPaid,
    paymentRef: o.paymentRef,
    externalCheckoutUrl: o.externalCheckoutUrl,
    pixQrCode: o.pixQrCode,
    pixQrCodeBase64: o.pixQrCodeBase64,
    cryptoPayAddress: o.cryptoPayAddress,
    cryptoPayAmount: o.cryptoPayAmount,
    cryptoPayCurrency: o.cryptoPayCurrency,
    cryptoPayUri: o.cryptoPayUri,
    cryptoQrCodeBase64: o.cryptoQrCodeBase64,
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
