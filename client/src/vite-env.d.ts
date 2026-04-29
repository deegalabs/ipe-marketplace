/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string;
  readonly VITE_API_URL: string;
  readonly VITE_IPE_TOKEN_ADDRESS: `0x${string}`;
  readonly VITE_IPE_MARKET_ADDRESS: `0x${string}`;
  readonly VITE_CHAIN_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
