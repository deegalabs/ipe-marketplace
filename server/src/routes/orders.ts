import { Router } from 'express';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import QRCode from 'qrcode';
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
import { authenticateWallet } from '../services/auth.js';
import { refundPayment } from '../services/mercadopago.js';
import { pickupToken, verifyPickupToken } from '../services/pickupToken.js';

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

/// Buyer's own orders. Requires a Privy session whose linked wallet matches the
/// requested address — the address alone is a PUBLIC identifier, so without this
/// anyone could read another buyer's pickupToken + payment payloads by address.
ordersRouter.get('/by-buyer/:address', async (req, res) => {
  const auth = req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });

  const address = req.params.address.toLowerCase();
  try {
    const wallets = await authenticateWallet(token);
    if (!wallets.includes(address)) return res.status(403).json({ error: 'not your orders' });
  } catch (err) {
    console.warn('[auth] buyer verification failed:', err instanceof Error ? err.message : err);
    return res.status(401).json({ error: 'invalid or expired session' });
  }

  const rows = await db.query.orders.findMany({
    where: eq(schema.orders.buyerAddress, address),
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

/// Admin refund. For PIX (Mercado Pago) we call the gateway's refund API;
/// the webhook will land later with status='refunded' but we flip the order
/// immediately so the admin UI reflects the decision. For crypto we only
/// flip status — refunds are irreversible and must be sent manually from
/// treasury. For direct (onchain) orders refund is also manual.
ordersRouter.post('/admin/:id/refund', requireAdmin, async (req, res) => {
  const row = await db.query.orders.findFirst({ where: eq(schema.orders.id, req.params.id) });
  if (!row) return res.status(404).json({ error: 'order not found' });
  if (
    row.status !== 'paid' &&
    row.status !== 'shipped' &&
    row.status !== 'delivered' &&
    row.status !== 'refund_requested'
  ) {
    return res.status(409).json({ error: `cannot refund order with status '${row.status}'` });
  }

  if (row.paymentProvider === 'mercadopago') {
    if (!row.paymentRef) return res.status(409).json({ error: 'order has no payment reference' });
    try {
      await refundPayment(row.paymentRef);
    } catch (err) {
      return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  const [updated] = await db
    .update(schema.orders)
    .set({ status: 'refunded', updatedAt: new Date() })
    .where(eq(schema.orders.id, req.params.id))
    .returning();
  res.json(serializeOrder(updated!, true));
});

/// Pickup verify — admin scans the buyer's QR at the event.
/// `POST /orders/admin/pickup/verify` with `{ token }` returns the order DTO
/// (with PII) so the admin sees product/buyer/event before confirming.
/// Doesn't change state — just decodes + reads.
ordersRouter.post('/admin/pickup/verify', requireAdmin, async (req, res) => {
  const token = String((req.body as { token?: string })?.token ?? '');
  const orderId = verifyPickupToken(token);
  if (!orderId) return res.status(400).json({ error: 'invalid or tampered token' });
  const row = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!row) return res.status(404).json({ error: 'order not found' });
  res.json(serializeOrder(row, true));
});

/// Pickup confirm — verify the token AND mark the order as delivered.
/// Race-safe via the status filter: only flips `paid` → `delivered`. Replays
/// (admin scans the same QR twice) return 409.
ordersRouter.post('/admin/pickup/confirm', requireAdmin, async (req, res) => {
  const token = String((req.body as { token?: string })?.token ?? '');
  const orderId = verifyPickupToken(token);
  if (!orderId) return res.status(400).json({ error: 'invalid or tampered token' });
  const [updated] = await db
    .update(schema.orders)
    .set({ status: 'delivered', updatedAt: new Date() })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, 'paid')))
    .returning();
  if (!updated) {
    const existing = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
    if (!existing) return res.status(404).json({ error: 'order not found' });
    return res.status(409).json({ error: `order is '${existing.status}', not 'paid'` });
  }
  res.json(serializeOrder(updated, true));
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

/// Public refund — buyer initiated, only while the order is still 'paid' (i.e.
/// NOT yet shipped/delivered). Same ID-as-authorization model as cancel.
///
/// Race safety: we claim the transition with a `WHERE status = 'paid'` guard, so
/// an admin marking the order shipped/delivered in the same instant wins the row
/// and the buyer refund becomes a no-op 409 — a buyer can never refund an order
/// that has already been handed over.
///
/// PIX (Mercado Pago) refunds automatically: we claim 'paid' → 'refunded' first,
/// then call MP; if MP rejects we roll the status back to 'paid'. Crypto refunds
/// can't move funds automatically (manual treasury send), so those become
/// 'refund_requested' for an admin to approve + send.
ordersRouter.post('/:id/refund', async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'not found' });
  }
  const existing = await db.query.orders.findFirst({ where: eq(schema.orders.id, req.params.id) });
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.status !== 'paid') {
    return res.status(409).json({ error: `cannot refund order with status '${existing.status}'` });
  }

  const isPix = existing.paymentProvider === 'mercadopago';
  const target = isPix ? 'refunded' : 'refund_requested';

  // Claim the transition race-safely.
  const [claimed] = await db
    .update(schema.orders)
    .set({ status: target, updatedAt: new Date() })
    .where(and(eq(schema.orders.id, req.params.id), eq(schema.orders.status, 'paid')))
    .returning();
  if (!claimed) {
    const now = await db.query.orders.findFirst({ where: eq(schema.orders.id, req.params.id) });
    return res.status(409).json({ error: `cannot refund order with status '${now?.status ?? 'unknown'}'` });
  }

  if (isPix) {
    if (!existing.paymentRef) {
      await revertToPaid(req.params.id);
      return res.status(409).json({ error: 'order has no payment reference' });
    }
    try {
      await refundPayment(existing.paymentRef);
    } catch (err) {
      // Log the provider detail server-side; return a generic error so this
      // public endpoint never leaks internal payment/provider information.
      console.error('[orders] buyer refund failed', req.params.id, err instanceof Error ? err.message : err);
      await revertToPaid(req.params.id);
      return res.status(502).json({ error: 'refund failed, please try again or contact support' });
    }
  }

  res.json(serializeOrder(claimed, false));
});

async function revertToPaid(id: string) {
  await db.update(schema.orders).set({ status: 'paid', updatedAt: new Date() }).where(eq(schema.orders.id, id));
}

/// Public pickup QR as a PNG. Emails embed this by URL (data: URIs get stripped
/// by Gmail), so the buyer can scan it straight from the inbox. Encodes the same
/// signed pickupToken the admin scanner verifies. ID-as-authorization, like the
/// other buyer routes.
ordersRouter.get('/:id/pickup-qr.png', async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'not found' });
  }
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, req.params.id) });
  if (!order || order.deliveryMethod !== 'pickup') return res.status(404).json({ error: 'not found' });
  const png = await QRCode.toBuffer(pickupToken(order.id), { width: 512, margin: 1 });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.send(png);
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
    // HMAC-signed token rendered as a QR for in-person pickup. Only meaningful
    // for paid pickup orders, but emitted on every row so the buyer can also
    // re-show it after delivery (for proof / receipt purposes).
    pickupToken: o.deliveryMethod === 'pickup' ? pickupToken(o.id) : null,
    trackingCode: o.trackingCode,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}
