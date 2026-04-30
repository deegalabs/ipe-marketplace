import { Router, raw } from 'express';
import { eq, and, inArray } from 'drizzle-orm';
import QRCode from 'qrcode';
import { createGatewayOrderInputSchema } from '@ipe/shared';
import { db, schema } from '../db/client.js';
import { encryptAddress } from '../crypto.js';
import { features } from '../env.js';
import { createPixCharge, getPayment, verifyWebhookSignature } from '../services/mercadopago.js';
import {
  createInvoice,
  createDirectPayment,
  getMerchantCoins,
  verifyIpnSignature,
} from '../services/nowpayments.js';
import { paymentUriFor } from '../services/cryptoPaymentUri.js';
import { roundUpCryptoAmount } from '../services/cryptoAmount.js';
import { mintReceiptForGatewayOrder } from '../services/onchain.js';
import { usdcToBrlCents } from './rates.js';
import {
  sendOrderCreated,
  sendOrderPaid,
  sendAdminNewOrder,
} from '../services/email.js';

export const gatewayRouter = Router();

/// Create order via gateway (PIX or crypto-gateway). Returns the order plus
/// the QR payload (PIX) or hosted checkout URL (NOWPayments).
gatewayRouter.post('/orders/gateway', async (req, res) => {
  const parsed = createGatewayOrderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, parsed.data.productId),
  });
  if (!product) return res.status(404).json({ error: 'product not found' });

  if (parsed.data.paymentMethod === 'pix' && !features.mercadopago) {
    return res.status(503).json({ error: 'PIX payment is not configured on this server' });
  }
  if (parsed.data.paymentMethod === 'crypto-gateway' && !features.nowpayments) {
    return res.status(503).json({ error: 'crypto-gateway is not configured on this server' });
  }

  /// USD is the canonical price (priceUsdc, USDC=1:1=USD). Conversion to BRL
  /// happens at order-creation time using live rates so admins only set USD.
  let totalPaid: bigint;
  if (parsed.data.paymentMethod === 'pix') {
    const conv = await usdcToBrlCents(BigInt(product.priceUsdc), BigInt(parsed.data.quantity));
    totalPaid = conv.cents;
    if (conv.source === 'fallback') {
      console.warn(`[gateway] PIX rate from fallback (CoinGecko down) — order ${parsed.data.productId}`);
    }
  } else {
    totalPaid = BigInt(product.priceUsdc) * BigInt(parsed.data.quantity);
  }

  if (totalPaid === 0n) {
    return res.status(400).json({ error: 'this product is not priced (set a USD price in admin first)' });
  }

  const provider = parsed.data.paymentMethod === 'pix' ? 'mercadopago' : 'nowpayments';

  // Insert as awaiting_payment. We'll fill paymentRef + checkout details below.
  const [order] = await db
    .insert(schema.orders)
    .values({
      productId: parsed.data.productId,
      buyerAddress: parsed.data.buyerAddress?.toLowerCase() ?? null,
      customerEmail: parsed.data.customerEmail,
      quantity: parsed.data.quantity,
      paymentMethod: parsed.data.paymentMethod,
      paymentProvider: provider,
      paymentTokenAddress: null,
      totalPaid: totalPaid.toString(),
      status: 'awaiting_payment',
      deliveryMethod: parsed.data.deliveryMethod,
      shippingAddressEnc: parsed.data.shippingAddress ? encryptAddress(parsed.data.shippingAddress) : null,
      pickupEventId: parsed.data.pickup?.eventId ?? null,
      pickupDisplayName: parsed.data.pickup?.displayName ?? null,
    })
    .returning();
  if (!order) return res.status(500).json({ error: 'order insert failed' });

  try {
    if (parsed.data.paymentMethod === 'pix') {
      const charge = await createPixCharge({
        amountCents: Number(totalPaid),
        description: `Ipê Store · ${product.name} ×${parsed.data.quantity}`,
        payerEmail: parsed.data.customerEmail,
        externalReference: order.id,
      });
      const [updated] = await db
        .update(schema.orders)
        .set({
          paymentRef: charge.paymentId,
          pixQrCode: charge.qrCode,
          pixQrCodeBase64: charge.qrCodeBase64,
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, order.id))
        .returning();
      void sendOrderCreated(updated!, product);
      void sendAdminNewOrder(updated!, product);
      return res.status(201).json({
        orderId: order.id,
        provider: 'mercadopago',
        pix: { qrCode: charge.qrCode, qrCodeBase64: charge.qrCodeBase64, expiresAt: charge.expiresAt },
      });
    } else {
      const priceUsd = Number(totalPaid) / 1e6; // USDC has 6 decimals → USD value
      const description = `Ipê Store · ${product.name} ×${parsed.data.quantity}`;

      // Direct payment (rendered in-app) when buyer picked a coin; falls back
      // to the hosted invoice page if no `payCurrency` was provided.
      if (parsed.data.payCurrency) {
        const payment = await createDirectPayment({
          priceUsd,
          payCurrency: parsed.data.payCurrency,
          description,
          externalReference: order.id,
        });
        // Round the crypto amount up to a typeable precision (2 decimals for
        // stablecoins, 4–6 for others). Buyer pays exact rounded value;
        // NOWPayments accepts the small overpay vs the precise amount.
        const roundedAmount = roundUpCryptoAmount(payment.payAmount, payment.payCurrency);
        // Build a structured payment URI (BIP-21 / EIP-681 / Solana Pay) so
        // payment-intent wallets like Rainbow Pay/Daimo can scan and auto-fill
        // chain + token + amount. Falls back to raw address for tickers we
        // haven't mapped — those still work with manual-entry wallets.
        const payUri = paymentUriFor(payment.payCurrency, payment.payAddress, roundedAmount);
        const qrCodeBase64 = await QRCode.toDataURL(payUri, { width: 256, margin: 1 });
        const [updated] = await db
          .update(schema.orders)
          .set({
            paymentRef: payment.paymentId,
            cryptoPayAddress: payment.payAddress,
            cryptoPayAmount: String(roundedAmount),
            cryptoPayCurrency: payment.payCurrency,
            cryptoPayUri: payUri,
            cryptoQrCodeBase64: qrCodeBase64,
            updatedAt: new Date(),
          })
          .where(eq(schema.orders.id, order.id))
          .returning();
        void sendOrderCreated(updated!, product);
        void sendAdminNewOrder(updated!, product);
        return res.status(201).json({
          orderId: order.id,
          provider: 'nowpayments',
          crypto: {
            payAddress: payment.payAddress,
            payAmount: roundedAmount,
            payCurrency: payment.payCurrency,
            payUri,
            qrCodeBase64,
            expiresAt: payment.expiresAt,
          },
        });
      }

      const invoice = await createInvoice({
        priceUsd,
        description,
        externalReference: order.id,
      });
      const [updated] = await db
        .update(schema.orders)
        .set({
          paymentRef: invoice.invoiceId,
          externalCheckoutUrl: invoice.hostedUrl,
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, order.id))
        .returning();
      void sendOrderCreated(updated!, product);
      void sendAdminNewOrder(updated!, product);
      return res.status(201).json({
        orderId: order.id,
        provider: 'nowpayments',
        checkoutUrl: invoice.hostedUrl,
      });
    }
  } catch (err) {
    console.error('[gateway] charge creation failed', err);
    // Best-effort cleanup: mark the placeholder order as cancelled so it doesn't
    // sit forever in awaiting_payment.
    await db
      .update(schema.orders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(schema.orders.id, order.id));
    return res.status(502).json({ error: 'failed to create gateway charge' });
  }
});

// ─── Crypto currencies (NOWPayments merchant-enabled list) ──────────
//
// Used by the in-app crypto checkout to render a coin picker. The hosted
// page does the same selection — we just bring it in-app.

gatewayRouter.get('/payment/crypto-currencies', async (_req, res) => {
  if (!features.nowpayments) {
    return res.status(503).json({ error: 'crypto-gateway is not configured on this server' });
  }
  try {
    const coins = await getMerchantCoins();
    return res.json({ coins });
  } catch (err) {
    console.error('[gateway] getMerchantCoins failed', err);
    return res.status(502).json({ error: 'failed to fetch crypto currencies' });
  }
});

// ─── Mercado Pago webhook ────────────────────────────────────────────

gatewayRouter.post('/webhooks/mercadopago', async (req, res) => {
  // MP sends notifications shaped like { type: 'payment', data: { id } } or via query string.
  const paymentId = String(
    (req.body as { data?: { id?: string | number } })?.data?.id
      ?? (req.query.id as string | undefined)
      ?? '',
  );
  if (!paymentId) {
    console.warn('[mercadopago] webhook with no payment id', req.body, req.query);
    return res.status(200).send(); // ack so MP stops retrying — nothing useful to do
  }

  const ok = verifyWebhookSignature({
    signature: req.header('x-signature') ?? undefined,
    requestId: req.header('x-request-id') ?? undefined,
    paymentId,
  });
  if (!ok) {
    console.warn('[mercadopago] webhook signature mismatch for', paymentId);
    return res.status(401).send();
  }

  try {
    const payment = await getPayment(paymentId);
    if (payment.status !== 'approved') {
      console.log(`[mercadopago] payment ${paymentId} status=${payment.status} — ignoring`);
      return res.status(200).send();
    }
    if (!payment.external_reference) return res.status(200).send();

    await markPaidAndMint(payment.external_reference);
    return res.status(200).send();
  } catch (err) {
    console.error('[mercadopago] webhook handler failed', err);
    return res.status(500).send();
  }
});

// ─── NOWPayments webhook ─────────────────────────────────────────────
// IPN sends raw JSON. We need the raw body to verify HMAC, so we mount a raw parser here.

gatewayRouter.post('/webhooks/nowpayments', raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = (req.body as Buffer).toString('utf8');
  const signature = req.header('x-nowpayments-sig') ?? undefined;
  if (!verifyIpnSignature(rawBody, signature)) {
    console.warn('[nowpayments] webhook signature mismatch');
    return res.status(401).send();
  }
  let parsed: { order_id?: string; payment_status?: string };
  try {
    parsed = JSON.parse(rawBody) as { order_id?: string; payment_status?: string };
  } catch {
    return res.status(400).send();
  }
  if (!parsed.order_id) return res.status(200).send();

  // Treat 'finished', 'confirmed', and 'partially_paid' (when amount matches) as paid.
  // Conservative for the PoC: only 'finished' marks the order paid.
  if (parsed.payment_status !== 'finished') {
    console.log(`[nowpayments] ${parsed.order_id} status=${parsed.payment_status} — ignoring`);
    return res.status(200).send();
  }

  await markPaidAndMint(parsed.order_id);
  return res.status(200).send();
});

/// Common path used by both webhooks once payment is confirmed.
///
/// Race-safe: a single UPDATE...RETURNING claims the row only if the status is
/// still in a pre-paid state. Concurrent webhook deliveries (Mercado Pago
/// retries within ms of each other, or NOWPayments confirming twice) only see
/// a row returned in the FIRST call — the second is a no-op.
///
/// After successfully claiming, we mint the 1155 (if the buyer attached a
/// wallet) and send the confirmation email. Mint failure does NOT roll back
/// the paid status — the operator can retry mintTo manually from cast/etherscan
/// once the underlying chain issue clears.
async function markPaidAndMint(orderId: string) {
  const [claimed] = await db
    .update(schema.orders)
    .set({ status: 'paid', updatedAt: new Date() })
    .where(
      and(
        eq(schema.orders.id, orderId),
        inArray(schema.orders.status, ['pending', 'awaiting_payment'] as const),
      ),
    )
    .returning();
  if (!claimed) return; // already paid by a previous delivery, or order missing — no-op

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, claimed.productId) });
  if (!product) {
    console.warn(`[gateway] order ${orderId} paid but product ${claimed.productId} missing — skipping mint+email`);
    return;
  }

  if (claimed.buyerAddress && product.tokenId) {
    try {
      await mintReceiptForGatewayOrder(
        claimed.buyerAddress as `0x${string}`,
        product.tokenId,
        claimed.quantity,
        claimed.id,
      );
    } catch (err) {
      console.error('[gateway] mintTo failed (order still marked paid — retry manually)', err);
    }
  }

  void sendOrderPaid(claimed, product);
}

// ─── Local dev helper ────────────────────────────────────────────────
// In local dev there's no public webhook URL, so this endpoint lets the admin
// manually mark a gateway order as paid (simulating the webhook). Disabled in prod
// by checking that the request comes from localhost.

gatewayRouter.post('/orders/gateway/:id/dev-confirm', async (req, res) => {
  const ip = req.ip ?? '';
  if (!ip.includes('127.0.0.1') && !ip.includes('::1') && !ip.includes('localhost')) {
    return res.status(403).json({ error: 'dev-confirm only available from localhost' });
  }
  await markPaidAndMint(req.params.id);
  return res.json({ ok: true });
});
