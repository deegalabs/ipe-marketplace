/// Rounds a NOWPayments crypto amount UP to a precision that's easy to type
/// without underpaying. Buyers sometimes have to type the amount manually
/// (wallet that didn't auto-fill the QR), so showing 0.00012345 BTC is hostile;
/// 0.000124 BTC is friendly and NOWPayments still confirms because the
/// rounded value is always >= the precise value.
///
/// Per-ticker precision balances "easy to type" against "no significant
/// overpayment":
///   • Stablecoins (USDT/USDC/DAI/BUSD)  → 2 decimals (cents)
///   • BTC                                → 6 decimals (~$0.0005 overpay max)
///   • Everything else (ETH, BNB, MATIC, SOL, …) → 4 decimals

function decimalsFor(ticker: string): number {
  const t = ticker.toLowerCase();
  if (t.startsWith('usdt') || t.startsWith('usdc') || t.startsWith('dai') || t === 'busd') return 2;
  if (t.startsWith('btc') || t.startsWith('bch')) return 6;
  return 4;
}

export function roundUpCryptoAmount(amount: number, ticker: string): number {
  if (amount <= 0) return 0;
  const d = decimalsFor(ticker);
  const factor = 10 ** d;
  return Math.ceil(amount * factor) / factor;
}
