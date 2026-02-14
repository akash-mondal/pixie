// Algebra Finance AMM — ABIs + calldata builders for BITE V2 Sandbox 2

import { encodeFunctionData, type Address } from 'viem';

// --- Contract addresses ---
export const ALGEBRA_SWAP_ROUTER = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb' as Address;
export const ALGEBRA_POSITION_MANAGER = '0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F' as Address;
export const ALGEBRA_QUOTER = '0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17' as Address;

// Token addresses
export const WETH_ADDRESS = '0xd74190a1b2a69c2f123a0df16ba21959a01eb843' as Address;
export const USDC_ADDRESS = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
export const WBTC_ADDRESS = '0x26b1f043545118103097767184c419f12b5a3e88' as Address;
export const USDT_ADDRESS = '0x36923f1c58a7a4640f1918dac2f5ce732cd0ea46' as Address;

// Token metadata
export const TOKENS: Record<string, { address: Address; decimals: number; symbol: string }> = {
  USDC: { address: USDC_ADDRESS, decimals: 6, symbol: 'USDC' },
  WETH: { address: WETH_ADDRESS, decimals: 18, symbol: 'WETH' },
  WBTC: { address: WBTC_ADDRESS, decimals: 8, symbol: 'WBTC' },
  USDT: { address: USDT_ADDRESS, decimals: 6, symbol: 'USDT' },
};

// Pair definitions with simulated prices
export const PAIRS: Record<string, { token0: string; token1: string; price: number; tick: number }> = {
  'ETH/USDC': { token0: 'USDC', token1: 'WETH', price: 2500, tick: 200340 },
  'WBTC/USDC': { token0: 'USDC', token1: 'WBTC', price: 97000, tick: 350000 },
  'ETH/WBTC': { token0: 'WETH', token1: 'WBTC', price: 0.026, tick: -36000 },
};

// --- ABIs (Algebra Integral v1.2.2 — all structs include `deployer` field) ---
export const SWAP_ROUTER_ABI = [
  {
    name: 'exactInputSingle',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'deployer', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'limitSqrtPrice', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const;

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// --- Calldata builders ---

export interface SwapParams {
  tokenIn: Address;
  tokenOut: Address;
  recipient: Address;
  amountIn: bigint;
  amountOutMinimum: bigint;
  deadline: bigint;
}

export function buildSwapCalldata(params: SwapParams): `0x${string}` {
  return encodeFunctionData({
    abi: SWAP_ROUTER_ABI,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      deployer: '0x0000000000000000000000000000000000000000' as Address, // standard pool
      recipient: params.recipient,
      deadline: params.deadline,
      amountIn: params.amountIn,
      amountOutMinimum: params.amountOutMinimum,
      limitSqrtPrice: 0n, // no price limit
    }],
  });
}

// --- QuoterV2 ABI (Algebra Integral v1.2.2 — struct with deployer) ---
export const QUOTER_V2_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'deployer', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'limitSqrtPrice', type: 'uint160' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'fee', type: 'uint16' },
    ],
  },
] as const;

// Get a real on-chain quote from QuoterV2
export async function getOnChainQuote(
  pair: string,
  amountIn: bigint,
): Promise<{ amountOut: bigint; fee: number; priceFormatted: string } | null> {
  try {
    const { getServerPublicClient } = await import('./server-wallet');
    const pc = getServerPublicClient();
    const { tokenIn, tokenOut } = resolveTokenAddresses(pair);

    const result = await pc.readContract({
      address: ALGEBRA_QUOTER,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{ tokenIn, tokenOut, deployer: '0x0000000000000000000000000000000000000000' as Address, amountIn, limitSqrtPrice: 0n }],
    });

    const amountOut = result[0] as bigint;
    const fee = Number(result[1]);

    // Format price based on pair
    const pairData = PAIRS[pair];
    const decimalsIn = TOKENS[pairData.token0].decimals;
    const decimalsOut = TOKENS[pairData.token1].decimals;
    const priceNum = (Number(amountOut) / Math.pow(10, decimalsOut)) / (Number(amountIn) / Math.pow(10, decimalsIn));
    const priceFormatted = priceNum > 100 ? `$${priceNum.toFixed(2)}` : `${priceNum.toFixed(6)}`;

    return { amountOut, fee, priceFormatted };
  } catch (err: any) {
    console.error(`[algebra] QuoterV2 quote failed for ${pair}:`, err.message);
    return null;
  }
}

// --- Market data (REAL prices from CoinGecko via prices.ts) ---

export interface MarketState {
  pair: string;
  price: number;
  tick: number;
  priceChange24h: number;
  volume24h: number;
  tvl: number;
  volatility: number;
  tickMovement: number;
  lpConcentration: string;
}

// Real market data — async, fetches live prices from CoinGecko
export async function getMarketStateLive(pair: string): Promise<MarketState> {
  const { getLiveMarketState } = await import('./prices');
  return getLiveMarketState(pair);
}

// Sync fallback using cached data (for non-async contexts)
export function getMarketState(pair: string): MarketState {
  const pairData = PAIRS[pair];
  if (!pairData) throw new Error(`Unknown pair: ${pair}`);

  // Use cached prices if available, otherwise use static defaults
  return {
    pair,
    price: pairData.price,
    tick: pairData.tick,
    priceChange24h: 0,
    volume24h: 500000,
    tvl: 2000000,
    volatility: 20,
    tickMovement: 0,
    lpConcentration: 'concentrated near current price',
  };
}

export function formatMarketContext(markets: MarketState[]): string {
  return markets.map(m => {
    const dir = m.priceChange24h >= 0 ? '+' : '';
    return `${m.pair}: $${m.price.toFixed(2)} (${dir}${m.priceChange24h.toFixed(1)}% 24h)
  vol: $${(m.volume24h / 1000).toFixed(0)}K | tvl: $${(m.tvl / 1e6).toFixed(2)}M
  volatility: ${m.volatility.toFixed(0)}% | tick: ${m.tick} (Δ${m.tickMovement > 0 ? '+' : ''}${m.tickMovement.toFixed(0)})
  liquidity: ${m.lpConcentration}`;
  }).join('\n\n');
}

// --- Tick math ---
export function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, decimals0 - decimals1);
}

export function resolveTokenAddresses(pair: string): { tokenIn: Address; tokenOut: Address } {
  const pairData = PAIRS[pair];
  if (!pairData) throw new Error(`Unknown pair: ${pair}`);
  return {
    tokenIn: TOKENS[pairData.token0].address,
    tokenOut: TOKENS[pairData.token1].address,
  };
}
