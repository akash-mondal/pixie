// GET /api/x402/strategy-hint/[agentId] — x402-gated partial strategy peek ($0.02)

import { NextRequest, NextResponse } from 'next/server';
import { getRiskBadge } from '@/lib/system-agents';
import { getAgentStore } from '@/lib/agent-store';
import { getAgentStats } from '@/lib/agent-memory';
import { SKALE_NETWORK, USDC_ADDRESS } from '@/lib/x402-agent';

const PRICE_ATOMIC = '20000'; // $0.02
const PAY_TO = '0x6F8BA9070E594bbC73E4CE2725133726e774D261';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const paymentHeader = req.headers.get('X-PAYMENT') || req.headers.get('PAYMENT-SIGNATURE');

  if (!paymentHeader) {
    return NextResponse.json({
      x402Version: 1,
      error: 'Payment required — agent strategy hint',
      accepts: [{
        scheme: 'exact',
        network: SKALE_NETWORK,
        maxAmountRequired: PRICE_ATOMIC,
        resource: `${req.nextUrl.protocol}//${req.nextUrl.host}${req.nextUrl.pathname}`,
        description: `Peek at agent ${agentId} strategy — risk level, pairs, speed`,
        mimeType: 'application/json',
        payTo: PAY_TO,
        maxTimeoutSeconds: 300,
        asset: USDC_ADDRESS,
        outputSchema: {},
        extra: { name: 'USD Coin', version: '2' },
      }],
    }, { status: 402 });
  }

  console.log(`[x402] Payment for strategy-hint: ${agentId}`);

  // Find the agent in the store
  const agent = getAgentStore().get(agentId);

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const stats = getAgentStats(agent.id);
  const riskBadge = getRiskBadge(agent.config.riskTolerance);

  return NextResponse.json({
    agentName: agent.name,
    personality: agent.personality,
    riskTolerance: agent.config.riskTolerance,
    riskLabel: riskBadge.label,
    tradingPairs: agent.config.tradingPairs,
    executionSpeed: agent.config.executionSpeed,
    contrarian: agent.config.contrarian,
    maxPositionSize: agent.config.maxPositionSize,
    stats: {
      winRate: stats.winRate.toFixed(0),
      avgPnl: stats.avgPnl.toFixed(0),
      totalTrades: stats.totalTrades,
      reputationAvg: stats.reputationAvg.toFixed(1),
    },
    paidVia: 'x402',
    paymentAmount: '$0.02 USDC',
  });
}
