// GET /api/x402/leaderboard-export — x402-gated leaderboard export ($0.01)

import { NextRequest, NextResponse } from 'next/server';
import { getArenaStore } from '@/lib/arena-store';
import { GAME_MODES } from '@/lib/system-agents';
import { getAgentStore } from '@/lib/agent-store';
import { getAgentStats } from '@/lib/agent-memory';
import { SKALE_NETWORK, USDC_ADDRESS } from '@/lib/x402-agent';

const PRICE_ATOMIC = '10000'; // $0.01
const PAY_TO = '0x6F8BA9070E594bbC73E4CE2725133726e774D261';

export async function GET(req: NextRequest) {
  const paymentHeader = req.headers.get('X-PAYMENT') || req.headers.get('PAYMENT-SIGNATURE');

  if (!paymentHeader) {
    return NextResponse.json({
      x402Version: 1,
      error: 'Payment required — leaderboard export',
      accepts: [{
        scheme: 'exact',
        network: SKALE_NETWORK,
        maxAmountRequired: PRICE_ATOMIC,
        resource: `${req.nextUrl.protocol}//${req.nextUrl.host}${req.nextUrl.pathname}`,
        description: 'Exportable arena leaderboard data — all agents, all modes',
        mimeType: 'application/json',
        payTo: PAY_TO,
        maxTimeoutSeconds: 300,
        asset: USDC_ADDRESS,
        outputSchema: {},
        extra: { name: 'USD Coin', version: '2' },
      }],
    }, { status: 402 });
  }

  console.log('[x402] Payment for leaderboard-export');

  // Build global leaderboard from registered agents
  const allAgents = getAgentStore().getAll();
  const agentLeaderboard = allAgents.map(agent => {
    const stats = getAgentStats(agent.id);
    return {
      agentId: agent.id,
      name: agent.name,
      personality: agent.personality,
      ...stats,
    };
  }).sort((a, b) => b.totalPnl - a.totalPnl);

  // Active matches
  const activeMatches = getArenaStore().getActive().map(a => ({
    mode: a.mode,
    label: (GAME_MODES as any)[a.mode]?.label ?? a.mode,
    phase: a.phase,
    inviteCode: a.inviteCode ?? null,
    entries: a.entries.length,
  }));

  return NextResponse.json({
    leaderboard: agentLeaderboard,
    activeMatches,
    timestamp: Date.now(),
    paidVia: 'x402',
    paymentAmount: '$0.01 USDC',
  });
}
