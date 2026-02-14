// GET /api/match/[code] — Get match state by invite code

import { NextRequest, NextResponse } from 'next/server';
import { getMatchByCode } from '@/lib/match-store';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const arena = getMatchByCode(code);

  if (!arena) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  // Serialize (strip non-serializable fields)
  return NextResponse.json({
    id: arena.id,
    onChainId: arena.onChainId,
    creator: arena.creator,
    entryFee: arena.entryFee,
    prizePool: arena.prizePool,
    maxAgents: arena.maxAgents,
    duration: arena.duration,
    deadline: arena.deadline,
    txHash: arena.txHash,
    inviteCode: arena.inviteCode,
    timeframe: arena.timeframe,
    tickInterval: arena.tickInterval,
    entries: arena.entries,
    resolved: arena.resolved,
    biteOps: arena.biteOps,
    totalTrades: arena.totalTrades,
    x402Payments: arena.x402Payments,
    x402TotalUsd: arena.x402TotalUsd,
    events: arena.events.slice(-100), // last 100 events
  });
}
