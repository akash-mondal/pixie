// GET /api/match/list — List all matches with invite codes

import { NextResponse } from 'next/server';
import { getAllMatches } from '@/lib/match-store';

export async function GET() {
  const matches = getAllMatches();
  return NextResponse.json(
    matches.map(m => ({
      id: m.id,
      onChainId: m.onChainId,
      inviteCode: m.inviteCode,
      timeframe: m.timeframe,
      tickInterval: m.tickInterval,
      entryFee: m.entryFee,
      prizePool: m.prizePool,
      maxAgents: m.maxAgents,
      duration: m.duration,
      deadline: m.deadline,
      entries: m.entries.length,
      resolved: m.resolved,
      biteOps: m.biteOps,
      totalTrades: m.totalTrades,
    }))
  );
}
