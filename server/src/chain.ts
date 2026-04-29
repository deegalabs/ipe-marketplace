import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { env } from './env.js';

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(env.BASE_SEPOLIA_RPC),
});

export const ipeMarketAddress = env.IPE_MARKET_ADDRESS as `0x${string}`;
export const ipeTokenAddress = env.IPE_TOKEN_ADDRESS as `0x${string}`;
