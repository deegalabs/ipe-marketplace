import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { baseSepolia } from 'viem/chains';
import { App } from './App';
import { env, wagmiConfig } from './config';
import { CurrencyProvider } from './lib/currency';
import { setPrivyTokenGetter } from './api';
import './styles.css';

const queryClient = new QueryClient();

/// Bridges Privy's hook-based access token API into the imperative `api.ts`
/// fetch wrapper. We can't call hooks inside the api module, so we register
/// the getter once Privy mounts and api.ts pulls fresh tokens per request.
function PrivyApiBridge({ children }: { children: React.ReactNode }) {
  const { getAccessToken } = usePrivy();
  useEffect(() => {
    setPrivyTokenGetter(() => getAccessToken());
  }, [getAccessToken]);
  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrivyProvider
      appId={env.privyAppId}
      config={{
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
        loginMethods: ['email', 'wallet'],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <CurrencyProvider>
            <PrivyApiBridge>
              <App />
            </PrivyApiBridge>
          </CurrencyProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  </React.StrictMode>,
);
