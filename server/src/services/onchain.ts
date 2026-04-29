import { createWalletClient, http, keccak256, toHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { IpeMarketAbi } from '@ipe/shared';
import { env } from '../env.js';

/// Mints an off-chain–paid receipt to the buyer. Call from webhook handlers
/// after the gateway confirms payment. Returns the txHash of the mintTo call,
/// or null if no DEPLOYER_PRIVATE_KEY is configured (dev-without-keys fallback).
export async function mintReceiptForGatewayOrder(
  buyer: `0x${string}`,
  productTokenId: bigint,
  quantity: number,
  fiatRef: string,
): Promise<string | null> {
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) {
    console.warn('[onchain] DEPLOYER_PRIVATE_KEY missing — skipping mintTo for', fiatRef);
    return null;
  }
  const account = privateKeyToAccount(deployerKey as Hex);
  const wallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(env.BASE_SEPOLIA_RPC),
  });

  const ref = keccak256(toHex(fiatRef));
  const hash = await wallet.writeContract({
    address: env.IPE_MARKET_ADDRESS as Hex,
    abi: IpeMarketAbi,
    functionName: 'mintTo',
    args: [buyer, productTokenId, BigInt(quantity), ref],
  });
  console.log(`[onchain] mintTo for ${fiatRef} → ${hash}`);
  return hash;
}
