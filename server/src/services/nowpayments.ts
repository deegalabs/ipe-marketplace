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

// ─── Merchant coins (in-app crypto checkout) ────────────────────────
//
// Returns the list of coins the merchant has enabled in their NOWPayments
// dashboard — same set the buyer would see on the hosted page. We cache for
// 5 minutes since this rarely changes.

export interface MerchantCoin {
  /// NOWPayments ticker, e.g. 'btc', 'eth', 'usdcerc20', 'usdcmatic'.
  ticker: string;
  /// Friendly display name for the UI.
  label: string;
}

/// Tiny mapping for the most common tickers — anything missing falls back to
/// the upper-cased ticker. We don't need NOWPayments' full-currencies endpoint
/// (paid plan) for the basics.
const TICKER_LABELS: Record<string, string> = {
  // L1 / native chain coins
  btc: 'Bitcoin',
  eth: 'Ethereum',
  ltc: 'Litecoin',
  zec: 'Zcash',
  bch: 'Bitcoin Cash',
  doge: 'Dogecoin',
  xmr: 'Monero',
  dash: 'Dash',
  trx: 'Tron',
  sol: 'Solana',
  matic: 'Polygon',
  pol: 'Polygon',
  bnb: 'BNB Smart Chain',
  ada: 'Cardano',
  dot: 'Polkadot',
  avax: 'Avalanche',
  ftm: 'Fantom',
  algo: 'Algorand',
  atom: 'Cosmos',
  xtz: 'Tezos',
  xrp: 'XRP',
  near: 'NEAR',
  // L2 / sidechain natives
  ethbase: 'ETH (Base)',
  etharb: 'ETH (Arbitrum)',
  ethop: 'ETH (Optimism)',
  arb: 'Arbitrum',
  op: 'Optimism',
  // USDT — every chain we've seen
  usdterc20: 'USDT (Ethereum)',
  usdttrc20: 'USDT (Tron)',
  usdtbsc:   'USDT (BSC)',
  usdtmatic: 'USDT (Polygon)',
  usdtsol:   'USDT (Solana)',
  usdtarb:   'USDT (Arbitrum)',
  usdtop:    'USDT (Optimism)',
  usdtavax:  'USDT (Avalanche)',
  usdtbase:  'USDT (Base)',
  usdtnear:  'USDT (NEAR)',
  usdtalgo:  'USDT (Algorand)',
  // USDC — every chain we've seen
  usdcerc20: 'USDC (Ethereum)',
  usdcmatic: 'USDC (Polygon)',
  usdcsol:   'USDC (Solana)',
  usdcbase:  'USDC (Base)',
  usdcbsc:   'USDC (BSC)',
  usdcarb:   'USDC (Arbitrum)',
  usdcop:    'USDC (Optimism)',
  usdcavax:  'USDC (Avalanche)',
  usdcnear:  'USDC (NEAR)',
  usdcalgo:  'USDC (Algorand)',
  // Other commonly-seen stablecoins
  daierc20:  'DAI (Ethereum)',
  daimatic:  'DAI (Polygon)',
  busdbsc:   'BUSD (BSC)',
  // Top ERC-20 utility tokens
  link:    'Chainlink',
  uni:     'Uniswap',
  aave:    'Aave',
  shib:    'Shiba Inu',
  pepe:    'Pepe',
  '1inch': '1inch',
};

let coinsCache: { coins: MerchantCoin[]; fetchedAt: number } | null = null;
const COINS_TTL_MS = 5 * 60_000;

export async function getMerchantCoins(): Promise<MerchantCoin[]> {
  if (!features.nowpayments) throw new NowPaymentsUnavailable();
  if (coinsCache && Date.now() - coinsCache.fetchedAt < COINS_TTL_MS) {
    return coinsCache.coins;
  }

  const res = await fetch(`${NP_BASE}/merchant/coins`, {
    headers: { 'x-api-key': env.NOWPAYMENTS_API_KEY },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments getMerchantCoins failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { selectedCurrencies?: string[] };
  const tickers = json.selectedCurrencies ?? [];
  const coins: MerchantCoin[] = tickers.map((t) => ({
    ticker: t,
    label: TICKER_LABELS[t.toLowerCase()] ?? t.toUpperCase(),
  }));
  coinsCache = { coins, fetchedAt: Date.now() };
  return coins;
}

// ─── Direct payment (renders inside our modal, no redirect) ──────────

interface CreateDirectPaymentArgs {
  priceUsd: number;
  payCurrency: string;
  description: string;
  externalReference: string;
}

export interface DirectPayment {
  paymentId: string;
  payAddress: string;
  /// Amount in the buyer's chosen `payCurrency`. NOWPayments locks this for
  /// `valid_until`; if the buyer underpays we'll see status='partially_paid'.
  payAmount: number;
  payCurrency: string;
  expiresAt: string | null;
}

export async function createDirectPayment(args: CreateDirectPaymentArgs): Promise<DirectPayment> {
  if (!features.nowpayments) throw new NowPaymentsUnavailable();

  const res = await fetch(`${NP_BASE}/payment`, {
    method: 'POST',
    headers: {
      'x-api-key': env.NOWPAYMENTS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount: args.priceUsd,
      price_currency: 'usd',
      pay_currency: args.payCurrency,
      order_id: args.externalReference,
      order_description: args.description,
      ipn_callback_url: `${env.PUBLIC_API_URL}/webhooks/nowpayments`,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments createPayment failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    payment_id: string | number;
    pay_address: string;
    pay_amount: number;
    pay_currency: string;
    valid_until?: string;
  };
  return {
    paymentId: String(json.payment_id),
    payAddress: json.pay_address,
    payAmount: json.pay_amount,
    payCurrency: json.pay_currency,
    expiresAt: json.valid_until ?? null,
  };
}

/// IPN webhook signature: HMAC-SHA512 of the *sorted* JSON body using IPN secret.
/// Sent in the `x-nowpayments-sig` header. We re-serialize sorted to verify.
export function verifyIpnSignature(rawBody: string, signature: string | undefined): boolean {
  if (!env.NOWPAYMENTS_IPN_SECRET) {
    if (env.ALLOW_UNVERIFIED_WEBHOOKS) {
      console.warn('[nowpayments] IPN secret missing — ALLOW_UNVERIFIED_WEBHOOKS bypassing verification');
      return true;
    }
    console.error('[nowpayments] IPN secret missing — rejecting payload');
    return false;
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
