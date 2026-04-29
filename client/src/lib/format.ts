import { formatUnits } from 'viem';
import type { ProductDTO } from '../api';
import type { DisplayCurrency } from '../config';
import type { Rates } from '@ipe/shared';

const TOKEN_DECIMALS = { ipe: 18, usdc: 6 } as const;

export const formatToken = (raw: string | bigint, symbol: 'IPE' | 'USDC') => {
  const decimals = symbol === 'IPE' ? 18 : 6;
  return `${Number(formatUnits(BigInt(raw), decimals)).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  })} ${symbol}`;
};

export const formatBrl = (cents: string | bigint) => {
  const reais = Number(cents) / 100;
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const formatUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/// Single price-display function that picks the right format based on the
/// currently selected currency and falls back to "—" when conversion data is
/// missing (e.g. CoinGecko didn't return a rate for IPE).
export function priceDisplay(p: ProductDTO, currency: DisplayCurrency, rates?: Rates): string {
  switch (currency) {
    case 'ipe':
      if (BigInt(p.priceIpe) === 0n) return '—';
      return formatToken(p.priceIpe, 'IPE');
    case 'usdc':
      if (BigInt(p.priceUsdc) === 0n) return '—';
      return formatToken(p.priceUsdc, 'USDC');
    case 'usd': {
      // Prefer the USDC price (1:1 USD), fall back to IPE × rate.
      if (BigInt(p.priceUsdc) > 0n) {
        return formatUsd(Number(BigInt(p.priceUsdc)) / 10 ** TOKEN_DECIMALS.usdc);
      }
      if (rates?.ipeUsd && BigInt(p.priceIpe) > 0n) {
        const ipeAmount = Number(formatUnits(BigInt(p.priceIpe), TOKEN_DECIMALS.ipe));
        return formatUsd(ipeAmount * Number(rates.ipeUsd));
      }
      return '—';
    }
    case 'brl': {
      if (BigInt(p.priceBrl) > 0n) return formatBrl(p.priceBrl);
      // Fallback: convert from USDC × usdcBrl
      if (rates?.usdcBrl && BigInt(p.priceUsdc) > 0n) {
        const usd = Number(BigInt(p.priceUsdc)) / 10 ** TOKEN_DECIMALS.usdc;
        return formatBrl(BigInt(Math.round(usd * Number(rates.usdcBrl) * 100)));
      }
      return '—';
    }
  }
}
