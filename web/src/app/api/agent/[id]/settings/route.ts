// POST /api/agent/[id]/settings — Update agent budget, selling prefs, user instructions

import { NextRequest, NextResponse } from 'next/server';
import { updateSettings, getMemory } from '@/lib/agent-memory';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;

  try {
    const body = await req.json();
    const { budgetPerRound, sellingPreference, strategyLocked, userInstructions } = body;

    const memory = getMemory(agentId);
    if (!memory) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    updateSettings(agentId, {
      budgetPerRound,
      sellingPreference,
      strategyLocked,
      userInstructions,
    });

    return NextResponse.json({
      success: true,
      agentId,
      settings: {
        budgetPerRound: memory.budgetPerRound,
        sellingPreference: memory.sellingPreference,
        strategyLocked: memory.strategyLocked,
        userInstructions: memory.userInstructions,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;

  const memory = getMemory(agentId);
  if (!memory) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  return NextResponse.json({
    agentId,
    settings: {
      budgetPerRound: memory.budgetPerRound,
      sellingPreference: memory.sellingPreference,
      strategyLocked: memory.strategyLocked,
      userInstructions: memory.userInstructions,
    },
    stats: {
      roundsPlayed: memory.roundsPlayed,
      roundsWon: memory.roundsWon,
      totalPnl: memory.totalPnl,
      x402Spent: memory.x402Spent,
      x402Earned: memory.x402Earned,
      reputationAvg: memory.reputationAvg,
      reputationCount: memory.reputationScores.length,
    },
  });
}
