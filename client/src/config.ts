import { http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { createConfig } from '@privy-io/wagmi';

export const env = {
  privyAppId: import.meta.env.VITE_PRIVY_APP_ID as string,
  apiUrl: (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:3001',
  ipeToken: import.meta.env.VITE_IPE_TOKEN_ADDRESS as `0x${string}`,
  ipeMarket: import.meta.env.VITE_IPE_MARKET_ADDRESS as `0x${string}`,
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? 84_532),
};

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  transports: { [baseSepolia.id]: http() },
});
