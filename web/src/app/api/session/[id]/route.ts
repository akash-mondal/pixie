// GET /api/session/[id] — Get session state with censored opponent data

import { NextRequest, NextResponse } from 'next/server';
import { getArenaStore } from '@/lib/arena-store';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const arena = getArenaStore().get(id);

  if (!arena) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const isRevealPhase = arena.phase === 'reveal' || arena.resolved;

  // Build lobby agents with censored data for opponents
  const lobbyAgents = arena.lobbyAgents.map(la => ({
    agentId: la.agentId,
    agentName: la.agentName,
    isUser: la.isUser,
    readyStep: la.readyStep,
    readyAt: la.readyAt,
    archetype: la.archetype,
    accentColor: la.accentColor,
    personality: la.isUser || isRevealPhase ? la.personality : la.personality.slice(0, 30) + '...',
    walletAddress: la.walletAddress,
    identityId: la.identityId,
    entryIndex: la.entryIndex,
    // Only expose full config for user's agent or after reveal
    config: la.isUser || isRevealPhase ? la.config : undefined,
  }));

  // Build entries with censored P&L for opponents during trading
  const entries = arena.entries.map(e => {
    const isOwned = e.agentId === arena.userAgentId;
    const state = arena.agentStates.get(e.agentId);
    const lobby = arena.lobbyAgents.find(la => la.agentId === e.agentId);

    // x402 events for this agent (always include — shows protocol usage)
    const x402Events = arena.events
      .filter(ev => (ev.type as string) === 'x402-purchase' && ev.agentId === e.agentId)
      .map(ev => ({
        ...ev.data,
        message: ev.message,
        timestamp: ev.timestamp,
      }));

    return {
      agentId: e.agentId,
      agentName: e.agentName,
      owner: e.owner,
      entryIndex: e.entryIndex,
      tradeCount: isOwned ? (state?.trades.length ?? e.tradeCount) : e.tradeCount,
      joinTxHash: e.joinTxHash,
      // P&L: visible for all agents (strategies remain BITE-encrypted)
      pnl: state?.pnl ?? e.pnl,
      revealed: e.revealed,
      // Encrypted strategy hash (always visible as proof of encryption)
      encryptedStrategy: e.encryptedStrategy || '',
      // Agent reasoning: only for user or after reveal
      lastReasoning: isOwned || isRevealPhase
        ? state?.trades[state.trades.length - 1]?.reasoning
        : undefined,
      // Stopped status
      stopped: state?.stopped || false,
      stopReason: isOwned || isRevealPhase ? state?.stopReason : undefined,
      // x402 events (visible for all — shows protocol in action)
      x402Events: isOwned || isRevealPhase ? x402Events : x402Events.map(ev => ({
        timestamp: ev.timestamp,
        message: ev.message,
        protocol: 'x402',
      })),
      // Trade details: full for user/reveal, encrypted hashes for opponents
      trades: isOwned || isRevealPhase
        ? state?.trades.map(t => ({
            pair: t.pair,
            direction: t.direction,
            reasoning: t.reasoning,
            simulatedPnL: t.simulatedPnL,
            timestamp: t.timestamp,
            recordTxHash: t.recordTxHash || undefined,
            swapTxHash: t.swapTxHash || undefined,
            realSwap: t.realSwap || false,
            encrypted: isRevealPhase ? t.encrypted : (t.encrypted?.slice(0, 20) + '...'),
            encryptedPnL: isRevealPhase ? t.encryptedPnL : undefined,
            encryptedReasoning: isRevealPhase ? t.encryptedReasoning : undefined,
          }))
        : undefined,
    };
  });

  return NextResponse.json({
    sessionId: arena.id,
    onChainId: arena.onChainId,
    mode: arena.mode,
    phase: arena.phase,
    phaseStartedAt: arena.phaseStartedAt,
    tradingStartsAt: arena.tradingStartsAt,
    deadline: arena.deadline,
    duration: arena.duration,
    tickInterval: arena.tickInterval,
    roundNumber: arena.roundNumber,
    userAgentId: arena.userAgentId,
    allReady: arena.allReady,
    resolved: arena.resolved,
    lobbyAgents,
    entries,
    stats: {
      biteOps: arena.biteOps,
      totalTrades: arena.totalTrades,
      x402Payments: arena.x402Payments,
      x402TotalUsd: arena.x402TotalUsd,
    },
    // Arena-level on-chain data
    arenaCreationTxHash: arena.txHash || undefined,
    resolvedAt: arena.resolvedAt || undefined,
  });
}
