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
    <div className="inline-flex rounded-md overflow-hidden border border-ipe-stone-200 text-xs w-full sm:w-auto bg-white/60 backdrop-blur-sm p-0.5 gap-0.5">
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => setCurrency(o.value)}
          className={`flex-1 sm:flex-initial px-2.5 py-1 rounded-xs font-medium transition-all duration-250 ease-smooth ${
            currency === o.value
              ? 'bg-ipe-green-600 text-ipe-cream-50 shadow-sm'
              : 'text-ipe-ink-70 hover:text-ipe-green-700 hover:bg-ipe-stone-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
