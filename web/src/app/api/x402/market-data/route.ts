// GET /api/x402/market-data — x402-gated enhanced market data ($0.005)

import { NextRequest, NextResponse } from 'next/server';
import { getMarketStateLive, formatMarketContext } from '@/lib/algebra';
import { SKALE_NETWORK, USDC_ADDRESS } from '@/lib/x402-agent';

const PRICE_ATOMIC = '5000'; // $0.005
const PAY_TO = '0x6F8BA9070E594bbC73E4CE2725133726e774D261';

export async function GET(req: NextRequest) {
  const paymentHeader = req.headers.get('X-PAYMENT') || req.headers.get('PAYMENT-SIGNATURE');

  if (!paymentHeader) {
    return NextResponse.json({
      x402Version: 1,
      error: 'Payment required — enhanced market data',
      accepts: [{
        scheme: 'exact',
        network: SKALE_NETWORK,
        maxAmountRequired: PRICE_ATOMIC,
        resource: `${req.nextUrl.protocol}//${req.nextUrl.host}${req.nextUrl.pathname}`,
        description: 'Enhanced CoinGecko + Algebra metrics — all trading pairs',
        mimeType: 'application/json',
        payTo: PAY_TO,
        maxTimeoutSeconds: 300,
        asset: USDC_ADDRESS,
        outputSchema: {},
        extra: { name: 'USD Coin', version: '2' },
      }],
    }, { status: 402 });
  }

  console.log('[x402] Payment for market-data');

  const [ethUsdc, wbtcUsdc, ethWbtc] = await Promise.all([
    getMarketStateLive('ETH/USDC'),
    getMarketStateLive('WBTC/USDC'),
    getMarketStateLive('ETH/WBTC'),
  ]);

  const markets = [ethUsdc, wbtcUsdc, ethWbtc];

  return NextResponse.json({
    markets,
    formatted: formatMarketContext(markets),
    timestamp: Date.now(),
    paidVia: 'x402',
    paymentAmount: '$0.005 USDC',
  });
}
