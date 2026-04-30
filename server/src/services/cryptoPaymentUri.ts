/// Builds wallet-compatible payment URIs from a NOWPayments (ticker, address,
/// amount) tuple. Encoding raw addresses works for "send" wallets that accept
/// manual amount entry (Trust, Coinbase, exchanges) but not for payment-intent
/// wallets like Yodl/Rainbow Pay/Daimo, which require structured URIs that
/// carry chain + token + amount.
///
/// Standards:
/// - BIP-21 for BTC-family chains (`bitcoin:addr?amount=X`)
/// - EIP-681 for EVM chains (`ethereum:tokenOrRecipient@chainId/transfer?address=...&uint256=...`)
/// - Solana Pay for Solana (`solana:addr?amount=X[&spl-token=mint]`)
/// - Plain address as last-resort fallback for tickers we haven't mapped.

interface CoinConfig {
  scheme: 'bip21' | 'eip681-native' | 'eip681-token' | 'solana' | 'solana-spl' | 'plain';
  /// BIP-21 URI prefix (e.g. 'bitcoin', 'litecoin', 'zcash').
  bip21Prefix?: string;
  /// EIP-681 chain ID (e.g. 1 mainnet, 137 polygon, 56 bsc, 8453 base).
  chainId?: number;
  /// ERC-20 contract address or SPL token mint.
  contract?: string;
  /// Token decimals — used to convert NOWPayments' human amount into the
  /// chain's smallest unit for EIP-681's `uint256` parameter.
  decimals?: number;
}

/// Lowercase NOWPayments tickers → URI config. Anything not listed here gets
/// `scheme: 'plain'` (raw address).
const COIN_CONFIGS: Record<string, CoinConfig> = {
  // ── BIP-21 family ─────────────────────────────────────────
  btc: { scheme: 'bip21', bip21Prefix: 'bitcoin' },
  ltc: { scheme: 'bip21', bip21Prefix: 'litecoin' },
  bch: { scheme: 'bip21', bip21Prefix: 'bitcoincash' },
  doge: { scheme: 'bip21', bip21Prefix: 'dogecoin' },
  zec: { scheme: 'bip21', bip21Prefix: 'zcash' },
  xmr: { scheme: 'bip21', bip21Prefix: 'monero' },
  dash: { scheme: 'bip21', bip21Prefix: 'dash' },

  // ── EVM native ────────────────────────────────────────────
  eth: { scheme: 'eip681-native', chainId: 1 },
  bnb: { scheme: 'eip681-native', chainId: 56 },
  matic: { scheme: 'eip681-native', chainId: 137 },
  pol: { scheme: 'eip681-native', chainId: 137 },     // Polygon's renamed native
  ethbase: { scheme: 'eip681-native', chainId: 8453 },
  ethop: { scheme: 'eip681-native', chainId: 10 },
  etharb: { scheme: 'eip681-native', chainId: 42161 },

  // ── ERC-20 stablecoins ────────────────────────────────────
  // USDT
  usdterc20: { scheme: 'eip681-token', chainId: 1,    contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6  },
  usdtbsc:   { scheme: 'eip681-token', chainId: 56,   contract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  usdtmatic: { scheme: 'eip681-token', chainId: 137,  contract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6  },
  usdtarb:   { scheme: 'eip681-token', chainId: 42161,contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6  },
  usdtop:    { scheme: 'eip681-token', chainId: 10,   contract: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6  },

  // USDC
  usdcerc20: { scheme: 'eip681-token', chainId: 1,    contract: '0xA0b86991c6218B36c1D19D4a2e9Eb0cE3606eB48', decimals: 6 },
  usdcmatic: { scheme: 'eip681-token', chainId: 137,  contract: '0x3c499c542cef5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
  usdcbsc:   { scheme: 'eip681-token', chainId: 56,   contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 6 },
  usdcbase:  { scheme: 'eip681-token', chainId: 8453, contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  usdcarb:   { scheme: 'eip681-token', chainId: 42161,contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  usdcop:    { scheme: 'eip681-token', chainId: 10,   contract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },

  // DAI
  daierc20:  { scheme: 'eip681-token', chainId: 1,    contract: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },

  // ── Solana ────────────────────────────────────────────────
  sol:     { scheme: 'solana' },
  usdcsol: { scheme: 'solana-spl', contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  usdtsol: { scheme: 'solana-spl', contract: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
};

/// Convert a human-readable amount (e.g. 0.05) to its smallest-unit string
/// representation (e.g. '50000000000000000' for 18 decimals). Uses `toFixed`
/// to avoid scientific notation and float precision drift.
function humanToSmallestUnit(amount: number, decimals: number): string {
  const fixed = amount.toFixed(decimals);
  const [int, dec = ''] = fixed.split('.');
  const padded = dec.padEnd(decimals, '0').slice(0, decimals);
  return (int + padded).replace(/^0+(?=\d)/, '') || '0';
}

export function paymentUriFor(ticker: string, address: string, amount: number): string {
  const cfg = COIN_CONFIGS[ticker.toLowerCase()];
  if (!cfg) return address;

  switch (cfg.scheme) {
    case 'bip21':
      return `${cfg.bip21Prefix}:${address}?amount=${amount}`;
    case 'eip681-native': {
      const wei = humanToSmallestUnit(amount, 18);
      return `ethereum:${address}@${cfg.chainId}?value=${wei}`;
    }
    case 'eip681-token': {
      const units = humanToSmallestUnit(amount, cfg.decimals ?? 18);
      return `ethereum:${cfg.contract}@${cfg.chainId}/transfer?address=${address}&uint256=${units}`;
    }
    case 'solana':
      return `solana:${address}?amount=${amount}`;
    case 'solana-spl':
      return `solana:${address}?amount=${amount}&spl-token=${cfg.contract}`;
    case 'plain':
    default:
      return address;
  }
}
