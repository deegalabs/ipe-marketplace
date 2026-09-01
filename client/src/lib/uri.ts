/// Defense-in-depth for URIs we render into an `href`. Payment/wallet URIs come
/// from the gateway via our server; if that value were ever attacker-influenced,
/// a `javascript:`/`data:` scheme would execute in our own origin when tapped.
/// We block those dangerous schemes and pass through everything else (wallet
/// deep-links like `bitcoin:`/`ethereum:`/`solana:` and plain `https:`).
const DANGEROUS_SCHEME = /^\s*(javascript|data|vbscript|file):/i;

export function safeWalletUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  return DANGEROUS_SCHEME.test(uri) ? null : uri;
}
