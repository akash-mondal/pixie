// GET /api/x402/pool-analytics — x402-gated Algebra pool data ($0.01)

import { NextRequest, NextResponse } from 'next/server';
import { getPoolAnalytics } from '@/lib/algebra-data';
import { SKALE_NETWORK, USDC_ADDRESS } from '@/lib/x402-agent';

const PRICE_ATOMIC = '10000'; // $0.01
const PAY_TO = '0x6F8BA9070E594bbC73E4CE2725133726e774D261';

export async function GET(req: NextRequest) {
  const paymentHeader = req.headers.get('X-PAYMENT') || req.headers.get('PAYMENT-SIGNATURE');

  if (!paymentHeader) {
    return NextResponse.json({
      x402Version: 1,
      error: 'Payment required — Algebra pool analytics',
      accepts: [{
        scheme: 'exact',
        network: SKALE_NETWORK,
        maxAmountRequired: PRICE_ATOMIC,
        resource: `${req.nextUrl.protocol}//${req.nextUrl.host}${req.nextUrl.pathname}`,
        description: 'Algebra Finance pool analytics — TVL, volume, fees, ticks',
        mimeType: 'application/json',
        payTo: PAY_TO,
        maxTimeoutSeconds: 300,
        asset: USDC_ADDRESS,
        outputSchema: {},
        extra: { name: 'USD Coin', version: '2' },
      }],
    }, { status: 402 });
  }

  // Payment present — serve data
  console.log('[x402] Payment for pool-analytics');

  const analytics = await getPoolAnalytics();

  return NextResponse.json({
    ...analytics,
    paidVia: 'x402',
    paymentNetwork: SKALE_NETWORK,
    paymentAmount: '$0.01 USDC',
  });
}
