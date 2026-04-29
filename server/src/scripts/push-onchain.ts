/**
 * Pushes every off-chain product (where tokenId is null) onchain by calling
 * IpeMarket.listProduct with all enabled per-currency prices, then updates
 * the DB with the resulting tokenId.
 *
 * The contract only stores ERC-20 prices (IPE, USDC). priceBrl stays off-chain
 * for the v0.3 PIX flow.
 */
import 'dotenv/config';
import { isNull, eq } from 'drizzle-orm';
import {
  createWalletClient,
  createPublicClient,
  http,
  decodeEventLog,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { IpeMarketAbi } from '@ipe/shared';
import { db, schema } from '../db/client.js';
import { env } from '../env.js';

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!deployerKey) throw new Error('DEPLOYER_PRIVATE_KEY is required');

const account = privateKeyToAccount(deployerKey as Hex);
const transport = http(env.BASE_SEPOLIA_RPC);
const publicClient = createPublicClient({ chain: baseSepolia, transport });
const walletClient = createWalletClient({ account, chain: baseSepolia, transport });

async function main() {
  const pending = await db.query.products.findMany({ where: isNull(schema.products.tokenId) });
  if (pending.length === 0) {
    console.log('[push-onchain] all products already onchain');
    return;
  }

  for (const p of pending) {
    const tokens: `0x${string}`[] = [];
    const prices: bigint[] = [];
    const priceIpe = BigInt(p.priceIpe);
    const priceUsdc = BigInt(p.priceUsdc);
    if (priceIpe > 0n) {
      tokens.push(env.IPE_TOKEN_ADDRESS as `0x${string}`);
      prices.push(priceIpe);
    }
    if (priceUsdc > 0n) {
      tokens.push(env.USDC_TOKEN_ADDRESS as `0x${string}`);
      prices.push(priceUsdc);
    }
    if (tokens.length === 0) {
      console.warn(`[push-onchain] "${p.name}" has no crypto prices set, skipping`);
      continue;
    }

    console.log(`[push-onchain] listing "${p.name}" with ${tokens.length} accepted token(s)…`);
    const maxSupply = BigInt(p.maxSupply);
    const hash = await walletClient.writeContract({
      address: env.IPE_MARKET_ADDRESS as Hex,
      abi: IpeMarketAbi,
      functionName: 'listProduct',
      args: [maxSupply, BigInt(p.royaltyBps), p.imageUrl, tokens, prices],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    let tokenId: bigint | null = null;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: IpeMarketAbi, data: log.data, topics: log.topics });
        if (decoded.eventName === 'ProductListed') {
          tokenId = (decoded.args as { productId: bigint }).productId;
          break;
        }
      } catch { /* skip non-matching logs */ }
    }
    if (tokenId === null) {
      console.warn(`[push-onchain] could not extract tokenId for "${p.name}"`);
      continue;
    }

    await db.update(schema.products).set({ tokenId, updatedAt: new Date() }).where(eq(schema.products.id, p.id));
    console.log(`[push-onchain] "${p.name}" → tokenId #${tokenId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
