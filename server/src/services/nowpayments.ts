import { createHmac } from 'node:crypto';
import { env, features } from '../env.js';

const NP_BASE = 'https://api.nowpayments.io/v1';

export class NowPaymentsUnavailable extends Error {
  constructor() {
    super('NOWPayments is not configured (NOWPAYMENTS_API_KEY missing)');
  }
}

interface CreateInvoiceArgs {
  /// Whatever currency the price is denominated in. We charge in USD for crypto-gateway —
  /// NOWPayments converts on the buyer's chosen coin at fill time.
  priceUsd: number;
  description: string;
  externalReference: string;
}

interface Invoice {
  invoiceId: string;
  hostedUrl: string;
}

/// Creates a hosted-checkout invoice. Buyer follows the URL, picks any coin
/// NOWPayments supports, and pays. We learn about confirmation via IPN webhook.
export async function createInvoice(args: CreateInvoiceArgs): Promise<Invoice> {
  if (!features.nowpayments) throw new NowPaymentsUnavailable();

  const res = await fetch(`${NP_BASE}/invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': env.NOWPAYMENTS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount: args.priceUsd,
      price_currency: 'usd',
      order_id: args.externalReference,
      order_description: args.description,
      ipn_callback_url: `${env.PUBLIC_API_URL}/webhooks/nowpayments`,
      success_url: `${env.PUBLIC_APP_URL}/orders?success=1`,
      cancel_url: `${env.PUBLIC_APP_URL}/orders?cancelled=1`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments createInvoice failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id: string; invoice_url: string };
  return { invoiceId: json.id, hostedUrl: json.invoice_url };
}

/// IPN webhook signature: HMAC-SHA512 of the *sorted* JSON body using IPN secret.
/// Sent in the `x-nowpayments-sig` header. We re-serialize sorted to verify.
export function verifyIpnSignature(rawBody: string, signature: string | undefined): boolean {
  if (!env.NOWPAYMENTS_IPN_SECRET) {
    console.warn('[nowpayments] IPN secret not configured — accepting unverified payload');
    return true;
  }
  if (!signature) return false;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return false;
  }
  const sorted = sortObjectKeys(parsed);
  const expected = createHmac('sha512', env.NOWPAYMENTS_IPN_SECRET)
    .update(JSON.stringify(sorted))
    .digest('hex');
  return expected === signature;
}

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj === null || typeof obj !== 'object') return obj;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
    out[k] = sortObjectKeys((obj as Record<string, unknown>)[k]);
  }
  return out;
}
