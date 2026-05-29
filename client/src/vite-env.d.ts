/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string;
  readonly VITE_API_URL: string;
  readonly VITE_IPE_TOKEN_ADDRESS: `0x${string}`;
  readonly VITE_USDC_TOKEN_ADDRESS: `0x${string}`;
  readonly VITE_IPE_MARKET_ADDRESS: `0x${string}`;
  readonly VITE_CHAIN_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// Injected at build time by vite.config.ts.
declare const __APP_VERSION__: string;
declare const __COMMIT_SHA__: string;
