// Algebra Finance Subgraph + On-Chain Data — pool analytics, TVL, volume, ticks
// Subgraph: skale-sandbox-graph.algebra.finance (BITE V2 Sandbox 2)

const ANALYTICS_SUBGRAPH = 'https://skale-sandbox-graph.algebra.finance/subgraphs/name/cryptoalgebra/analytics';
const FARMING_SUBGRAPH = 'https://skale-sandbox-graph.algebra.finance/subgraphs/name/cryptoalgebra/farmings';

export interface PoolData {
  id: string;
  token0: { symbol: string; id: string; decimals: string };
  token1: { symbol: string; id: string; decimals: string };
  liquidity: string;
  sqrtPrice: string;
  tick: string;
  volumeUSD: string;
  totalValueLockedUSD: string;
  feesUSD: string;
  txCount: string;
}

export interface RecentSwap {
  timestamp: string;
  amount0: string;
  amount1: string;
  amountUSD: string;
  sender: string;
}

// Query pools from analytics subgraph
export async function getPoolsFromSubgraph(): Promise<PoolData[]> {
  try {
    const query = `{
      pools(first: 10, orderBy: totalValueLockedUSD, orderDirection: desc) {
        id
        token0 { symbol id decimals }
        token1 { symbol id decimals }
        liquidity
        sqrtPrice
        tick
        volumeUSD
        totalValueLockedUSD
        feesUSD
        txCount
      }
    }`;

    const res = await fetch(ANALYTICS_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data?.data?.pools ?? [];
  } catch (err: any) {
    console.error('[algebra-data] Subgraph query failed:', err.message);
    return [];
  }
}

// Get recent swaps from subgraph
export async function getRecentSwaps(poolId?: string, limit: number = 10): Promise<RecentSwap[]> {
  try {
    const poolFilter = poolId ? `pool: "${poolId}"` : '';
    const query = `{
      swaps(first: ${limit}, orderBy: timestamp, orderDirection: desc${poolFilter ? `, where: { ${poolFilter} }` : ''}) {
        timestamp
        amount0
        amount1
        amountUSD
        sender
      }
    }`;

    const res = await fetch(ANALYTICS_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data?.data?.swaps ?? [];
  } catch (err: any) {
    console.error('[algebra-data] Recent swaps query failed:', err.message);
    return [];
  }
}

// Get pool analytics summary (for x402 endpoint)
export async function getPoolAnalytics(): Promise<{
  pools: PoolData[];
  totalTVL: number;
  totalVolume: number;
  totalFees: number;
  poolCount: number;
}> {
  const pools = await getPoolsFromSubgraph();

  let totalTVL = 0;
  let totalVolume = 0;
  let totalFees = 0;

  for (const pool of pools) {
    totalTVL += parseFloat(pool.totalValueLockedUSD) || 0;
    totalVolume += parseFloat(pool.volumeUSD) || 0;
    totalFees += parseFloat(pool.feesUSD) || 0;
  }

  return {
    pools,
    totalTVL,
    totalVolume,
    totalFees,
    poolCount: pools.length,
  };
}

// Get tick data for a pool (via TickLens on-chain)
export async function getTicksForPool(poolAddress: string): Promise<Array<{ tick: number; liquidityNet: string }>> {
  const TICK_LENS = '0x13fcE0acbe6Fb11641ab753212550574CaD31415';

  try {
    const { getServerPublicClient } = await import('./server-wallet');
    const pc = getServerPublicClient();

    // TickLens.getPopulatedTicksInWord — simplified to just get nearby ticks
    const result = await pc.readContract({
      address: TICK_LENS as `0x${string}`,
      abi: [{
        name: 'getPopulatedTicksInWord',
        type: 'function',
        stateMutability: 'view',
        inputs: [
          { name: 'pool', type: 'address' },
          { name: 'tickTableIndex', type: 'int16' },
        ],
        outputs: [{
          name: 'populatedTicks',
          type: 'tuple[]',
          components: [
            { name: 'tick', type: 'int24' },
            { name: 'liquidityNet', type: 'int128' },
            { name: 'liquidityGross', type: 'uint128' },
          ],
        }],
      }],
      functionName: 'getPopulatedTicksInWord',
      args: [poolAddress as `0x${string}`, 0],
    });

    return (result as any[]).map((t: any) => ({
      tick: Number(t.tick),
      liquidityNet: String(t.liquidityNet),
    }));
  } catch (err: any) {
    console.error('[algebra-data] TickLens query failed:', err.message);
    return [];
  }
}
