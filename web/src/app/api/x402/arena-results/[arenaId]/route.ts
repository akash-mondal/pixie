// GET /api/x402/arena-results/[arenaId] — x402-gated full arena results ($0.01)

import { NextRequest, NextResponse } from 'next/server';
import { getArenaStore } from '@/lib/arena-store';
import { SKALE_NETWORK, USDC_ADDRESS } from '@/lib/x402-agent';

const PRICE_ATOMIC = '10000'; // $0.01
const PAY_TO = '0x6F8BA9070E594bbC73E4CE2725133726e774D261';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ arenaId: string }> },
) {
  const { arenaId } = await params;
  const paymentHeader = req.headers.get('X-PAYMENT') || req.headers.get('PAYMENT-SIGNATURE');

  if (!paymentHeader) {
    return NextResponse.json({
      x402Version: 1,
      error: 'Payment required — arena results',
      accepts: [{
        scheme: 'exact',
        network: SKALE_NETWORK,
        maxAmountRequired: PRICE_ATOMIC,
        resource: `${req.nextUrl.protocol}//${req.nextUrl.host}${req.nextUrl.pathname}`,
        description: `Full trade history + decrypted strategies for arena ${arenaId}`,
        mimeType: 'application/json',
        payTo: PAY_TO,
        maxTimeoutSeconds: 300,
        asset: USDC_ADDRESS,
        outputSchema: {},
        extra: { name: 'USD Coin', version: '2' },
      }],
    }, { status: 402 });
  }

  console.log(`[x402] Payment for arena-results: ${arenaId}`);

  const arena = getArenaStore().get(arenaId);
  if (!arena) {
    return NextResponse.json({ error: 'Arena not found' }, { status: 404 });
  }

  const leaderboard = [...arena.entries]
    .sort((a, b) => b.pnl - a.pnl)
    .map((entry, rank) => ({
      rank: rank + 1,
      agentName: entry.agentName,
      agentId: entry.agentId,
      tradeCount: entry.tradeCount,
      pnl: entry.pnl,
      pnlPercent: (entry.pnl / 100).toFixed(2),
      revealed: entry.revealed,
    }));

  return NextResponse.json({
    arenaId,
    mode: arena.mode,
    roundNumber: arena.roundNumber,
    resolved: arena.resolved,
    biteOps: arena.biteOps,
    totalTrades: arena.totalTrades,
    x402Payments: arena.x402Payments,
    x402TotalUsd: arena.x402TotalUsd,
    leaderboard,
    eventCount: arena.events.length,
    paidVia: 'x402',
    paymentAmount: '$0.01 USDC',
  });
}
