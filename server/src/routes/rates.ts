import { Router } from 'express';
import { env } from '../env.js';

export const ratesRouter = Router();

interface CachedRates {
  ipeUsd: string | null;
  ipeBrl: string | null;
  usdcBrl: string | null;
  fetchedAt: string;
  source: string;
}

let cache: CachedRates | null = null;
let inFlight: Promise<CachedRates> | null = null;
const CACHE_TTL_MS = 60_000;

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

ratesRouter.get('/', async (_req, res) => {
  const fresh = cache && Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_TTL_MS;
  if (fresh) return res.json(cache);
  // De-dupe concurrent requests so a burst doesn't fan out to coingecko.
  inFlight ??= fetchRates().finally(() => { inFlight = null; });
  cache = await inFlight;
  res.json(cache);
});
