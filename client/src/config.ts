import { http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { createConfig } from '@privy-io/wagmi';

export const env = {
  privyAppId: import.meta.env.VITE_PRIVY_APP_ID as string,
  apiUrl: (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:3001',
  ipeToken: import.meta.env.VITE_IPE_TOKEN_ADDRESS as `0x${string}`,
  usdcToken: import.meta.env.VITE_USDC_TOKEN_ADDRESS as `0x${string}`,
  ipeMarket: import.meta.env.VITE_IPE_MARKET_ADDRESS as `0x${string}`,
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? 84_532),
};

/// Token metadata used for display + tx building.
export const TOKENS = {
  ipe: { symbol: 'IPE', decimals: 18, address: () => env.ipeToken },
  usdc: { symbol: 'USDC', decimals: 6, address: () => env.usdcToken },
} as const;
export type CryptoToken = keyof typeof TOKENS;

/// Display currencies for the price toggle. 'ipe' and 'usdc' read prices straight
/// from product fields; 'usd' and 'brl' use rates from /rates to convert.
export type DisplayCurrency = 'ipe' | 'usdc' | 'usd' | 'brl';

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  transports: { [baseSepolia.id]: http() },
});
