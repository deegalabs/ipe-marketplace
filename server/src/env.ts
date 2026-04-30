import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string().url(),
  BASE_SEPOLIA_RPC: z.string().url().default('https://sepolia.base.org'),
  CHAIN_ID: z.coerce.number().default(84_532),
  /// Onchain addresses are optional in gateway-only deploys (the contract still
  /// gets called for mintTo, but only when these are set). Endpoints that need
  /// them (treasury, indexer, mintTo) check the addresses before running.
  IPE_TOKEN_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .or(z.literal(''))
    .default('0x0000000000000000000000000000000000000000'),
  USDC_TOKEN_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .or(z.literal(''))
    .default('0x0000000000000000000000000000000000000000'),
  IPE_MARKET_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .or(z.literal(''))
    .default('0x0000000000000000000000000000000000000000'),
  SHIPPING_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/, 'must be 32-byte hex'),
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().default(15_000),
  INDEXER_START_BLOCK: z.coerce.bigint().default(0n),
  COINGECKO_IPE_ID: z.string().default(''),

  /// Public-facing base URL for the API (used in webhook callbacks and email links).
  /// In dev: cloudflared/ngrok tunnel URL. In prod: the Vercel deploy URL.
  PUBLIC_API_URL: z.string().url().default('http://localhost:3005'),
  /// Public-facing base URL for the storefront (linked from emails so buyers can
  /// see their orders).
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),

  /// Mercado Pago (PIX). Get from https://www.mercadopago.com.br/developers
  /// Empty values disable the PIX path with a graceful 503.
  MERCADOPAGO_ACCESS_TOKEN: z.string().default(''),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().default(''),

  /// NOWPayments (crypto-gateway). Get from https://account.nowpayments.io
  NOWPAYMENTS_API_KEY: z.string().default(''),
  /// IPN secret signs the webhook body; set in NOWPayments dashboard.
  NOWPAYMENTS_IPN_SECRET: z.string().default(''),

  /// Resend (transactional email). https://resend.com
  RESEND_API_KEY: z.string().default(''),
  /// Verified sender (must be on a domain you've added to Resend).
  RESEND_FROM_EMAIL: z.string().default('IPE Store <orders@ipecity.example>'),
  /// Where admin-alert emails go. Empty = skip admin emails.
  ADMIN_NOTIFICATION_EMAIL: z.string().default(''),

  /// Privy server credentials — used to verify access tokens issued by the
  /// Privy widget on the client. PRIVY_APP_ID must match VITE_PRIVY_APP_ID.
  /// PRIVY_APP_SECRET is in the Privy dashboard → Settings → API keys.
  PRIVY_APP_ID: z.string().default(''),
  PRIVY_APP_SECRET: z.string().default(''),

  /// On boot, if set and not yet present, this email is added to the admin
  /// allowlist. Idempotent — exists for fresh deploys to bootstrap the first
  /// admin without a SQL step.
  ADMIN_INITIAL_EMAIL: z.string().default(''),

  /// Skip the chain event indexer (gateway-only deploys don't need it).
  DISABLE_INDEXER: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  /// Escape hatch for local dev / staging where you can't reach the real
  /// webhook providers. NEVER set this in production — it skips signature
  /// verification on /webhooks/*, letting anyone mark orders as paid.
  ALLOW_UNVERIFIED_WEBHOOKS: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);

/// Production hardening — fail fast on missing critical secrets so a
/// misconfigured deploy crashes loudly instead of running with insecure
/// fallbacks.
const isProd = env.NODE_ENV === 'production';

if (isProd) {
  if (!env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET) {
    throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET are required in production');
  }
  if (env.ALLOW_UNVERIFIED_WEBHOOKS) {
    throw new Error('ALLOW_UNVERIFIED_WEBHOOKS must not be enabled in production');
  }
  if (env.MERCADOPAGO_ACCESS_TOKEN && !env.MERCADOPAGO_WEBHOOK_SECRET) {
    throw new Error('MERCADOPAGO_WEBHOOK_SECRET is required when Mercado Pago is enabled in production');
  }
  if (env.NOWPAYMENTS_API_KEY && !env.NOWPAYMENTS_IPN_SECRET) {
    throw new Error('NOWPAYMENTS_IPN_SECRET is required when NOWPayments is enabled in production');
  }
}

/// Quick capability flags so routes can return 503 cleanly when a provider isn't configured.
export const features = {
  mercadopago: !!env.MERCADOPAGO_ACCESS_TOKEN,
  nowpayments: !!env.NOWPAYMENTS_API_KEY,
  email: !!env.RESEND_API_KEY,
};
