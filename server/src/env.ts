import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string().url(),
  BASE_SEPOLIA_RPC: z.string().url().default('https://sepolia.base.org'),
  CHAIN_ID: z.coerce.number().default(84_532),
  IPE_TOKEN_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  IPE_MARKET_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  SHIPPING_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/, 'must be 32-byte hex'),
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().default(15_000),
  INDEXER_START_BLOCK: z.coerce.bigint().default(0n),
});

export const env = envSchema.parse(process.env);
