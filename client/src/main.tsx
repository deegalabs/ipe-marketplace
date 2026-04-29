import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { baseSepolia } from 'viem/chains';
import { App } from './App';
import { env, wagmiConfig } from './config';
import { CurrencyProvider } from './lib/currency';
import { AdminAuthProvider } from './lib/adminAuth';
import './styles.css';

const queryClient = new QueryClient();

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
            <AdminAuthProvider>
              <App />
            </AdminAuthProvider>
          </CurrencyProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  </React.StrictMode>,
);
