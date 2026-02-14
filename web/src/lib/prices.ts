// Real market data from CoinGecko — replaces simulated getMarketState()

import type { MarketState } from './algebra';

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true';

interface PriceCache {
  ethereum: { usd: number; usd_24h_change: number; usd_24h_vol: number };
  bitcoin: { usd: number; usd_24h_change: number; usd_24h_vol: number };
  fetchedAt: number;
}

let cache: PriceCache | null = null;
const CACHE_TTL = 30_000; // 30s

async function fetchPrices(): Promise<PriceCache> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache;
  }

  try {
    const res = await fetch(COINGECKO_URL, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const data = await res.json();
    cache = {
      ethereum: {
        usd: data.ethereum?.usd ?? 2500,
        usd_24h_change: data.ethereum?.usd_24h_change ?? 0,
        usd_24h_vol: data.ethereum?.usd_24h_vol ?? 500000,
      },
      bitcoin: {
        usd: data.bitcoin?.usd ?? 97000,
        usd_24h_change: data.bitcoin?.usd_24h_change ?? 0,
        usd_24h_vol: data.bitcoin?.usd_24h_vol ?? 1000000,
      },
      fetchedAt: Date.now(),
    };
    return cache;
  } catch (err) {
    // Fallback to last cache or defaults
    if (cache) return cache;
    return {
      ethereum: { usd: 2500, usd_24h_change: 0, usd_24h_vol: 500000 },
      bitcoin: { usd: 97000, usd_24h_change: 0, usd_24h_vol: 1000000 },
      fetchedAt: Date.now(),
    };
  }
}

// Previous price tracking for real P&L calculation
const previousPrices: Record<string, number> = {};

export async function getLiveMarketState(pair: string): Promise<MarketState> {
  const prices = await fetchPrices();

  let price: number;
  let change24h: number;
  let vol24h: number;
  let tick: number;

  switch (pair) {
    case 'ETH/USDC':
      price = prices.ethereum.usd;
      change24h = prices.ethereum.usd_24h_change;
      vol24h = prices.ethereum.usd_24h_vol;
      tick = Math.round(Math.log(price / 1) / Math.log(1.0001)); // approx tick
      break;
    case 'WBTC/USDC':
      price = prices.bitcoin.usd;
      change24h = prices.bitcoin.usd_24h_change;
      vol24h = prices.bitcoin.usd_24h_vol;
      tick = Math.round(Math.log(price / 1) / Math.log(1.0001));
      break;
    case 'ETH/WBTC':
      price = prices.ethereum.usd / prices.bitcoin.usd;
      change24h = prices.ethereum.usd_24h_change - prices.bitcoin.usd_24h_change;
      vol24h = Math.min(prices.ethereum.usd_24h_vol, prices.bitcoin.usd_24h_vol);
      tick = Math.round(Math.log(price / 1) / Math.log(1.0001));
      break;
    default:
      price = 1;
      change24h = 0;
      vol24h = 0;
      tick = 0;
  }

  // Track price movement for tick direction
  const prevPrice = previousPrices[pair] ?? price;
  const tickMovement = ((price - prevPrice) / prevPrice) * 10000; // bps
  previousPrices[pair] = price;

  return {
    pair,
    price,
    tick,
    priceChange24h: change24h,
    volume24h: vol24h,
    tvl: vol24h * 2, // estimate
    volatility: Math.abs(change24h) * 3 + 10, // rough vol estimate
    tickMovement,
    lpConcentration: Math.abs(tickMovement) < 50
      ? 'concentrated near current price'
      : 'liquidity shifting with price movement',
  };
}

// Calculate real P&L from price deltas
export function calculateRealPnL(
  pair: string,
  direction: 'buy' | 'sell',
  entryPrice: number,
  currentPrice: number,
  positionSize: number,
): number {
  const priceChange = (currentPrice - entryPrice) / entryPrice;
  const directionMultiplier = direction === 'buy' ? 1 : -1;
  return Math.round(priceChange * directionMultiplier * positionSize * 10000); // bps
}
