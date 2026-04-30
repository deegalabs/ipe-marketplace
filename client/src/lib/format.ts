import { formatUnits } from 'viem';
import type { ProductDTO } from '../api';

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

/// Single public-facing price label — always USD. USDC is pegged 1:1 so we
/// derive directly from priceUsdc. The buyer sees the exact USD value at
/// checkout converted to whatever method they pick (IPE / PIX / crypto).
export function priceDisplay(p: ProductDTO): string {
  if (BigInt(p.priceUsdc) > 0n) {
    return formatUsd(Number(BigInt(p.priceUsdc)) / 10 ** TOKEN_DECIMALS.usdc);
  }
  return '—';
}
