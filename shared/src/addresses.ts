export const SUPPORTED_CHAINS = {
  baseSepolia: 84_532,
  baseMainnet: 8_453,
} as const;

export type ChainId = (typeof SUPPORTED_CHAINS)[keyof typeof SUPPORTED_CHAINS];

export interface ContractAddresses {
  ipeToken: `0x${string}`;
  ipeMarket: `0x${string}`;
}

/// Filled in via env at runtime (see .env.example). The map exists so future-deployed
/// contracts can be tracked here without touching consumer code.
export function getAddresses(env: Record<string, string | undefined>, chainId: ChainId): ContractAddresses {
  if (chainId === SUPPORTED_CHAINS.baseSepolia) {
    return {
      ipeToken: (env.VITE_IPE_TOKEN_ADDRESS ?? env.IPE_TOKEN_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
      ipeMarket: (env.VITE_IPE_MARKET_ADDRESS ?? env.IPE_MARKET_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    };
  }
  throw new Error(`No addresses configured for chain ${chainId}`);
}
