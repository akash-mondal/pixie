// Algebra Finance — tick math, pool data, and subgraph queries

const ALGEBRA_SUBGRAPH = 'https://skale-sandbox-graph.algebra.finance/subgraphs/name/analytics';
const ALGEBRA_FACTORY = '0x10253594A832f967994b44f33411940533302ACb';

// Simulated USDC/WETH pool data (BITE V2 sandbox has 0 pools)
export const SIMULATED_POOL = {
  tick: 200340,
  sqrtPriceX96: '79228162514264337593543950336',
  fee: 500,
  liquidity: '1200000000000000000',
  tickSpacing: 60,
  token0: { symbol: 'USDC', decimals: 6 },
  token1: { symbol: 'WETH', decimals: 18 },
  tvlUSD: 2000000,
  volume24hUSD: 500000,
  fees24hUSD: 2500,
};

export interface PoolData {
  tick: number;
  sqrtPriceX96: string;
  fee: number;
  liquidity: string;
  tickSpacing: number;
  token0: { symbol: string; decimals: number };
  token1: { symbol: string; decimals: number };
  tvlUSD: number;
  volume24hUSD: number;
  fees24hUSD: number;
  simulated: boolean;
}

/// Try to fetch real pool data from Algebra subgraph, fallback to simulated
export async function fetchPoolData(): Promise<PoolData> {
  try {
    const query = `{
      pools(first: 1, orderBy: totalValueLockedUSD, orderDirection: desc) {
        tick
        sqrtPrice
        feeTier
        liquidity
        tickSpacing
        token0 { symbol decimals }
        token1 { symbol decimals }
        totalValueLockedUSD
        volumeUSD
      }
    }`;

    const res = await fetch(ALGEBRA_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(5000),
    });

    const json = await res.json() as any;
    const pool = json?.data?.pools?.[0];

    if (pool && Number(pool.totalValueLockedUSD) > 0) {
      return {
        tick: Number(pool.tick),
        sqrtPriceX96: pool.sqrtPrice,
        fee: Number(pool.feeTier),
        liquidity: pool.liquidity,
        tickSpacing: Number(pool.tickSpacing) || 60,
        token0: { symbol: pool.token0.symbol, decimals: Number(pool.token0.decimals) },
        token1: { symbol: pool.token1.symbol, decimals: Number(pool.token1.decimals) },
        tvlUSD: Number(pool.totalValueLockedUSD),
        volume24hUSD: Number(pool.volumeUSD),
        fees24hUSD: Number(pool.volumeUSD) * 0.005,
        simulated: false,
      };
    }
  } catch {
    // Subgraph unavailable or empty
  }

  return { ...SIMULATED_POOL, simulated: true };
}

// --- Tick Math (pure functions) ---

/// Convert a tick to a human-readable price
export function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
  const price = Math.pow(1.0001, tick);
  const adjusted = price * Math.pow(10, decimals0 - decimals1);
  return adjusted;
}

/// Suggest a tick range around the current tick
export function suggestTickRange(
  currentTick: number,
  tickSpacing: number,
  widthMultiplier: number,
): { lower: number; upper: number } {
  const halfWidth = Math.floor(widthMultiplier * tickSpacing);
  const lower = Math.floor((currentTick - halfWidth) / tickSpacing) * tickSpacing;
  const upper = Math.ceil((currentTick + halfWidth) / tickSpacing) * tickSpacing;
  return { lower, upper };
}

/// Calculate LP concentration metrics
export function calculateLPConcentration(
  currentTick: number,
  lower: number,
  upper: number,
): { efficiency: number; ilRisk: string; tickWidth: number } {
  const tickWidth = upper - lower;
  const fullRangeWidth = 1774544; // approx full range in Uniswap V3 ticks
  const efficiency = Math.round(fullRangeWidth / tickWidth);

  let ilRisk: string;
  if (tickWidth < 200) {
    ilRisk = 'extreme';
  } else if (tickWidth < 1000) {
    ilRisk = 'high';
  } else if (tickWidth < 3000) {
    ilRisk = 'medium';
  } else if (tickWidth < 20000) {
    ilRisk = 'low';
  } else {
    ilRisk = 'very low';
  }

  return { efficiency, ilRisk, tickWidth };
}

/// Calculate annualized fee APR
export function feeAPR(feesUSD24h: number, tvlUSD: number): number {
  if (tvlUSD === 0) return 0;
  return (feesUSD24h / tvlUSD) * 365 * 100;
}

/// Format pool data for display
export function formatPoolSummary(pool: PoolData): string {
  const price = tickToPrice(pool.tick, pool.token0.decimals, pool.token1.decimals);
  const apr = feeAPR(pool.fees24hUSD, pool.tvlUSD);
  const source = pool.simulated ? '(simulated)' : '(live)';

  return [
    `  Pool: ${pool.token0.symbol}/${pool.token1.symbol} ${source}`,
    `  Current tick: ${pool.tick.toLocaleString()} | Price: $${price.toFixed(2)}`,
    `  Fee tier: ${(pool.fee / 10000).toFixed(2)}% | Liquidity: ${(Number(pool.liquidity) / 1e18).toFixed(1)}M`,
    `  24h Volume: $${(pool.volume24hUSD / 1000).toFixed(0)}K | Fee APR: ~${apr.toFixed(1)}%`,
    `  Tick spacing: ${pool.tickSpacing}`,
  ].join('\n');
}

/// Build context string for LLM agent analysis
export function buildAlgebraContext(pool: PoolData): string {
  const price = tickToPrice(pool.tick, pool.token0.decimals, pool.token1.decimals);
  const apr = feeAPR(pool.fees24hUSD, pool.tvlUSD);

  return `Algebra Finance ${pool.token0.symbol}/${pool.token1.symbol} Pool:
- Current tick: ${pool.tick} (price: $${price.toFixed(2)})
- Fee tier: ${(pool.fee / 10000).toFixed(2)}%
- TVL: $${(pool.tvlUSD / 1e6).toFixed(2)}M
- 24h Volume: $${(pool.volume24hUSD / 1000).toFixed(0)}K
- Fee APR: ${apr.toFixed(1)}%
- Tick spacing: ${pool.tickSpacing}
- Full range width: 1,774,544 ticks

Tick range guidelines:
- Ultra-tight (120 ticks): ~15,000x efficiency, EXTREME IL risk
- Tight (1,200 ticks): ~1,500x efficiency, moderate IL risk
- Moderate (4,000 ticks): ~400x efficiency, low IL risk
- Wide (40,000 ticks): ~44x efficiency, very low IL risk
- Full range: 1x efficiency, near-zero IL risk`;
}
