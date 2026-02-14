// POST /api/session/create — Start a new session-based arena match

import { NextRequest, NextResponse } from 'next/server';
import { startSession } from '@/lib/arena-lifecycle';
import { getAgentStore } from '@/lib/agent-store';
import { GAME_MODES, type GameMode } from '@/lib/system-agents';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, agentId } = body as { mode: string; agentId: string };

    // Validate mode
    if (!mode || !(mode in GAME_MODES)) {
      return NextResponse.json(
        { error: `Invalid mode. Valid: ${Object.keys(GAME_MODES).join(', ')}` },
        { status: 400 },
      );
    }

    // Validate agent exists and is registered
    if (!agentId) {
      return NextResponse.json({ error: 'agentId required' }, { status: 400 });
    }

    const agentStore = getAgentStore();
    const agent = agentStore.get(agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found. Register at /agents first.' }, { status: 404 });
    }

    // Check agent has wallet + identity
    if (!agent.walletAddress) {
      return NextResponse.json({ error: 'Agent not funded. Register properly at /agents.' }, { status: 400 });
    }

    // Start session
    const { sessionId } = await startSession(
      mode as GameMode,
      agentId,
      agent.config,
      agent.walletAddress,
      agent.onChainId,
    );

    // Increment arena count
    agentStore.incrementArenas(agentId);

    return NextResponse.json({
      sessionId,
      mode,
      duration: GAME_MODES[mode as GameMode].tradingDuration,
      opponents: GAME_MODES[mode as GameMode].maxOpponents,
    });
  } catch (err: any) {
    console.error('[session/create] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create session' }, { status: 500 });
  }
}
