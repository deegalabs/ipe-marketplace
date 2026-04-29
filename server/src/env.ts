import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string().url(),
  BASE_SEPOLIA_RPC: z.string().url().default('https://sepolia.base.org'),
  CHAIN_ID: z.coerce.number().default(84_532),
  IPE_TOKEN_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  USDC_TOKEN_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  IPE_MARKET_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
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
});

export const env = envSchema.parse(process.env);

/// Quick capability flags so routes can return 503 cleanly when a provider isn't configured.
export const features = {
  mercadopago: !!env.MERCADOPAGO_ACCESS_TOKEN,
  nowpayments: !!env.NOWPAYMENTS_API_KEY,
  email: !!env.RESEND_API_KEY,
};
