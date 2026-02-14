// GET /api/market-data — live market prices for UI (no x402 gate)

import { NextResponse } from 'next/server';
import { getMarketStateLive } from '@/lib/algebra';

export async function GET() {
  const [ethUsdc, wbtcUsdc, ethWbtc] = await Promise.all([
    getMarketStateLive('ETH/USDC'),
    getMarketStateLive('WBTC/USDC'),
    getMarketStateLive('ETH/WBTC'),
  ]);

  return NextResponse.json({
    markets: [ethUsdc, wbtcUsdc, ethWbtc],
    timestamp: Date.now(),
  });
}
