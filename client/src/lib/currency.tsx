import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { DisplayCurrency } from '../config';
import type { Rates } from '@ipe/shared';

interface CurrencyCtx {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  rates: Rates | undefined;
}

const ctx = createContext<CurrencyCtx | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<DisplayCurrency>(
    () => (localStorage.getItem('display_currency') as DisplayCurrency) ?? 'usdc',
  );
  const { data: rates } = useQuery({ queryKey: ['rates'], queryFn: api.rates, refetchInterval: 60_000 });

  const set = (c: DisplayCurrency) => {
    setCurrency(c);
    localStorage.setItem('display_currency', c);
  };

  return <ctx.Provider value={{ currency, setCurrency: set, rates }}>{children}</ctx.Provider>;
}

export function useCurrency() {
  const v = useContext(ctx);
  if (!v) throw new Error('useCurrency must be inside CurrencyProvider');
  return v;
}

export function CurrencyToggle() {
  const { currency, setCurrency } = useCurrency();
  const opts: { value: DisplayCurrency; label: string }[] = [
    { value: 'ipe', label: 'IPE' },
    { value: 'usdc', label: 'USDC' },
    { value: 'usd', label: 'USD' },
    { value: 'brl', label: 'BRL' },
  ];
  return (
    <div className="inline-flex rounded-md overflow-hidden border border-ipe-green/20 text-xs">
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => setCurrency(o.value)}
          className={`px-2 py-1 ${currency === o.value ? 'bg-ipe-green text-ipe-cream' : 'bg-white text-ipe-ink hover:bg-ipe-green/5'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
