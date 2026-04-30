import { Router } from 'express';
import { env } from '../env.js';

export const ratesRouter = Router();

export interface CachedRates {
  ipeUsd: string | null;
  ipeBrl: string | null;
  /// USD↔BRL conversion rate (we read it from USDC's CoinGecko entry since
  /// USDC is pegged 1:1 to USD).
  usdcBrl: string | null;
  fetchedAt: string;
  source: string;
}

let cache: CachedRates | null = null;
let inFlight: Promise<CachedRates> | null = null;
const CACHE_TTL_MS = 60_000;

/// Fallback USD/BRL when CoinGecko is unreachable. Conservative number from
/// recent history — refreshed manually if BRL drifts hard. Used only so the
/// PIX path doesn't 503 on a transient outage.
const FALLBACK_USDC_BRL = '5.30';

async function fetchRates(): Promise<CachedRates> {
  // CoinGecko free tier: 50 calls/min — we cache for 60s so we never hit the limit.
  const params = new URLSearchParams({
    vs_currencies: 'usd,brl',
    ids: env.COINGECKO_IPE_ID ? `${env.COINGECKO_IPE_ID},usd-coin` : 'usd-coin',
  });
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?${params}`);
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const json = (await res.json()) as Record<string, { usd?: number; brl?: number }>;
    const ipe = env.COINGECKO_IPE_ID ? json[env.COINGECKO_IPE_ID] : undefined;
    const usdc = json['usd-coin'];
    return {
      ipeUsd: ipe?.usd?.toString() ?? null,
      ipeBrl: ipe?.brl?.toString() ?? null,
      usdcBrl: usdc?.brl?.toString() ?? null,
      fetchedAt: new Date().toISOString(),
      source: 'coingecko',
    };
  } catch (err) {
    console.warn('[rates] coingecko fetch failed', err);
    return {
      ipeUsd: null,
      ipeBrl: null,
      usdcBrl: null,
      fetchedAt: new Date().toISOString(),
      source: 'unavailable',
    };
  }
}

/// Reusable rates getter — used both by the /rates route and by the gateway
/// PIX path that needs to convert USD prices to BRL at order-creation time.
export async function getRates(): Promise<CachedRates> {
  const fresh = cache && Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_TTL_MS;
  if (fresh) return cache!;
  inFlight ??= fetchRates().finally(() => { inFlight = null; });
  cache = await inFlight;
  return cache;
}

/// Convert a USDC smallest-unit value (6 decimals) to BRL cents using the
/// current usdcBrl rate. Falls back to a constant when CoinGecko is down so
/// PIX checkouts keep working — buyer pays a slightly stale rate, admin can
/// notice via the rates panel.
export async function usdcToBrlCents(priceUsdc: bigint, quantity: bigint): Promise<{
  cents: bigint;
  rate: string;
  source: 'coingecko' | 'fallback';
}> {
  const rates = await getRates();
  const rate = rates.usdcBrl ?? FALLBACK_USDC_BRL;
  const usdAmount = Number(priceUsdc * quantity) / 1e6;
  const brlAmount = usdAmount * Number(rate);
  return {
    cents: BigInt(Math.round(brlAmount * 100)),
    rate,
    source: rates.usdcBrl ? 'coingecko' : 'fallback',
  };
}

ratesRouter.get('/', async (_req, res) => {
  const r = await getRates();
  res.json(r);
});
