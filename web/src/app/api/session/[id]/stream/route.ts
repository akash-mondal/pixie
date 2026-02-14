// GET /api/session/[id]/stream — SSE stream for lobby + trading + reveal events

import { NextRequest } from 'next/server';
import { getArenaStore } from '@/lib/arena-store';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const arenaStore = getArenaStore();
  const arena = arenaStore.get(id);

  if (!arena) {
    return new Response('Session not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  let lastEventIndex = 0;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const isRevealPhase = () => arena.phase === 'reveal' || arena.resolved;

      // Send initial state
      send({
        type: 'init',
        sessionId: arena.id,
        onChainId: arena.onChainId,
        mode: arena.mode,
        phase: arena.phase,
        userAgentId: arena.userAgentId,
        deadline: arena.deadline,
        duration: arena.duration,
        allReady: arena.allReady,
        lobbyAgents: arena.lobbyAgents.map(la => ({
          agentId: la.agentId,
          agentName: la.agentName,
          isUser: la.isUser,
          readyStep: la.readyStep,
          readyAt: la.readyAt,
          archetype: la.archetype,
          accentColor: la.accentColor,
          entryIndex: la.entryIndex,
          personality: la.personality,
          walletAddress: la.walletAddress,
          identityId: la.identityId,
          config: la.isUser ? la.config : undefined,
        })),
        stats: {
          biteOps: arena.biteOps,
          totalTrades: arena.totalTrades,
          x402Payments: arena.x402Payments,
          x402TotalUsd: arena.x402TotalUsd,
        },
      });

      const interval = setInterval(() => {
        const current = arenaStore.get(id);
        if (!current) {
          send({ type: 'error', message: 'Session not found' });
          clearInterval(interval);
          controller.close();
          return;
        }

        // Send new events since last check
        const newEvents = current.events.slice(lastEventIndex);
        for (const event of newEvents) {
          // Censor opponent reasoning/P&L during trading
          if (!isRevealPhase() && event.agentId !== current.userAgentId && event.agentId !== 'system') {
            send({
              ...event,
              // Keep the event type + agent info, but censor internals
              data: event.data ? {
                ...event.data,
                reasoning: undefined,
                pnl: undefined,
                // Keep lobby step info visible
                lobbyStep: (event.data as any)?.lobbyStep,
                isUser: (event.data as any)?.isUser,
                archetype: (event.data as any)?.archetype,
              } : undefined,
            });
          } else {
            send(event);
          }
        }
        lastEventIndex = current.events.length;

        // Send periodic state update
        send({
          type: 'state',
          phase: current.phase,
          allReady: current.allReady,
          deadline: current.deadline,
          tradingStartsAt: current.tradingStartsAt,
          resolved: current.resolved,
          stats: {
            biteOps: current.biteOps,
            totalTrades: current.totalTrades,
            x402Payments: current.x402Payments,
            x402TotalUsd: current.x402TotalUsd,
          },
          // Lobby progress (full fields so frontend merge works)
          lobbyAgents: current.lobbyAgents.map(la => ({
            agentId: la.agentId,
            agentName: la.agentName,
            isUser: la.isUser,
            readyStep: la.readyStep,
            readyAt: la.readyAt,
            archetype: la.archetype,
            accentColor: la.accentColor,
            personality: la.personality,
            walletAddress: la.walletAddress,
            identityId: la.identityId,
            entryIndex: la.entryIndex,
            config: la.isUser || isRevealPhase() ? la.config : undefined,
          })),
          // Entry data (censored for opponents during trading)
          entries: current.entries.map(e => {
            const isOwned = e.agentId === current.userAgentId;
            const state = current.agentStates.get(e.agentId);
            return {
              agentId: e.agentId,
              agentName: e.agentName,
              owner: e.owner,
              entryIndex: e.entryIndex,
              tradeCount: isOwned ? (state?.trades.length ?? e.tradeCount) : e.tradeCount,
              pnl: state?.pnl ?? e.pnl,
              revealed: e.revealed,
              stopped: state?.stopped || false,
              stopReason: isOwned || isRevealPhase() ? state?.stopReason : undefined,
              tickNumber: state?.tickNumber || 0,
              encryptedStrategy: e.encryptedStrategy || '',
              joinTxHash: e.joinTxHash || '',
              // User's trades for live display
              trades: isOwned ? state?.trades.map(t => ({
                pair: t.pair,
                direction: t.direction,
                reasoning: t.reasoning,
                simulatedPnL: t.simulatedPnL,
                timestamp: t.timestamp,
                recordTxHash: t.recordTxHash || undefined,
                swapTxHash: t.swapTxHash || undefined,
                realSwap: t.realSwap || false,
              })) : undefined,
            };
          }),
        });

        // Close stream after reveal
        if (current.resolved) {
          // Send final leaderboard
          send({
            type: 'resolved',
            leaderboard: [...current.entries]
              .sort((a, b) => b.pnl - a.pnl)
              .map((entry, rank) => {
                const state = current.agentStates.get(entry.agentId);
                return {
                  rank: rank + 1,
                  agentId: entry.agentId,
                  agentName: entry.agentName,
                  tradeCount: entry.tradeCount,
                  pnl: entry.pnl,
                  pnlPercent: (entry.pnl / 100).toFixed(2),
                  trades: state?.trades.map(t => ({
                    pair: t.pair,
                    direction: t.direction,
                    reasoning: t.reasoning,
                    simulatedPnL: t.simulatedPnL,
                    encrypted: t.encrypted?.slice(0, 20) + '...',
                    swapTxHash: t.swapTxHash || undefined,
                    realSwap: t.realSwap || false,
                  })),
                };
              }),
          });

          clearInterval(interval);
          setTimeout(() => controller.close(), 2000);
        }
      }, 1500);

      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
