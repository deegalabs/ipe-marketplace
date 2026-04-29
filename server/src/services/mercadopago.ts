import { createHmac } from 'node:crypto';
import { env, features } from '../env.js';

const MP_BASE = 'https://api.mercadopago.com';

export class MercadoPagoUnavailable extends Error {
  constructor() {
    super('Mercado Pago is not configured (MERCADOPAGO_ACCESS_TOKEN missing)');
  }
}

interface CreatePixArgs {
  /// BRL amount in cents.
  amountCents: number;
  description: string;
  payerEmail: string;
  /// Local order id, returned back as `external_reference` so the webhook can match.
  externalReference: string;
}

interface PixCharge {
  paymentId: string;
  qrCode: string;             // PIX copia-e-cola payload
  qrCodeBase64: string;       // PNG image base64 (no data: prefix)
  expiresAt: string | null;
}

/// Creates a PIX charge via Mercado Pago and returns the QR payload + image.
export async function createPixCharge(args: CreatePixArgs): Promise<PixCharge> {
  if (!features.mercadopago) throw new MercadoPagoUnavailable();

  const res = await fetch(`${MP_BASE}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      // Mercado Pago requires an idempotency key to safely retry.
      'X-Idempotency-Key': args.externalReference,
    },
    body: JSON.stringify({
      transaction_amount: args.amountCents / 100,
      payment_method_id: 'pix',
      description: args.description,
      external_reference: args.externalReference,
      notification_url: `${env.PUBLIC_API_URL}/webhooks/mercadopago`,
      payer: { email: args.payerEmail },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mercado Pago createPixCharge failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    id: number;
    point_of_interaction: { transaction_data: { qr_code: string; qr_code_base64: string } };
    date_of_expiration: string | null;
  };

  return {
    paymentId: String(json.id),
    qrCode: json.point_of_interaction.transaction_data.qr_code,
    qrCodeBase64: json.point_of_interaction.transaction_data.qr_code_base64,
    expiresAt: json.date_of_expiration,
  };
}

/// Fetch a payment to verify its current status. Used by the webhook handler since
/// the webhook body itself only carries the id — the source of truth lives at /v1/payments/:id.
export async function getPayment(paymentId: string) {
  if (!features.mercadopago) throw new MercadoPagoUnavailable();
  const res = await fetch(`${MP_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Mercado Pago getPayment failed: ${res.status}`);
  return (await res.json()) as {
    id: number;
    status: 'pending' | 'approved' | 'authorized' | 'in_process' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back';
    external_reference: string | null;
    transaction_amount: number;
  };
}

/// Verifies the v2 webhook signature header. Mercado Pago signs with
/// `ts=<unix>,v1=<hmac-sha256(secret, "id:<paymentId>;request-id:<x-request-id>;ts:<ts>;")>`.
/// Returns true if the signature is valid (or if no secret configured — dev mode).
export function verifyWebhookSignature(headers: {
  signature: string | undefined;
  requestId: string | undefined;
  paymentId: string;
}): boolean {
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    console.warn('[mercadopago] webhook secret not configured — accepting unverified payload');
    return true;
  }
  if (!headers.signature || !headers.requestId) return false;

  const parts = headers.signature.split(',').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${headers.paymentId};request-id:${headers.requestId};ts:${ts};`;
  const expected = createHmac('sha256', env.MERCADOPAGO_WEBHOOK_SECRET).update(manifest).digest('hex');
  return expected === v1;
}
