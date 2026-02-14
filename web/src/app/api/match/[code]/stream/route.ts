// GET /api/match/[code]/stream — SSE stream of match events by invite code

import { NextRequest } from 'next/server';
import { getMatchByCode } from '@/lib/match-store';
import { spectatorConnect, spectatorDisconnect, getSpectatorCount } from '@/lib/spectator-tracker';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const arena = getMatchByCode(code);

  if (!arena) {
    return new Response('Match not found', { status: 404 });
  }

  const arenaId = arena.id;
  const encoder = new TextEncoder();
  let lastIndex = 0;

  // Track this spectator
  spectatorConnect(arenaId);

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'init',
        matchCode: code,
        arenaId: arena.id,
        entries: arena.entries.length,
        biteOps: arena.biteOps,
        totalTrades: arena.totalTrades,
        resolved: arena.resolved,
        deadline: arena.deadline,
        phase: arena.phase,
        mode: arena.mode,
        roundNumber: arena.roundNumber,
        tradingStartsAt: arena.tradingStartsAt,
        x402Payments: arena.x402Payments,
        x402TotalUsd: arena.x402TotalUsd,
        spectators: getSpectatorCount(arenaId),
      })}\n\n`));

      const interval = setInterval(() => {
        const currentArena = getMatchByCode(code);
        if (!currentArena) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Match not found' })}\n\n`));
          clearInterval(interval);
          spectatorDisconnect(arenaId);
          controller.close();
          return;
        }

        // Send new events since last check
        const newEvents = currentArena.events.slice(lastIndex);
        for (const event of newEvents) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        lastIndex = currentArena.events.length;

        // Send periodic state update (includes spectator count)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'state',
          entries: currentArena.entries.length,
          biteOps: currentArena.biteOps,
          totalTrades: currentArena.totalTrades,
          x402Payments: currentArena.x402Payments,
          x402TotalUsd: currentArena.x402TotalUsd,
          resolved: currentArena.resolved,
          phase: currentArena.phase,
          mode: currentArena.mode,
          roundNumber: currentArena.roundNumber,
          deadline: currentArena.deadline,
          tradingStartsAt: currentArena.tradingStartsAt,
          spectators: getSpectatorCount(arenaId),
          entriesData: currentArena.entries.map(e => ({
            agentId: e.agentId,
            agentName: e.agentName,
            tradeCount: e.tradeCount,
            pnl: e.pnl,
            revealed: e.revealed,
          })),
        })}\n\n`));

        // Close stream if match resolved
        if (currentArena.resolved) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'resolved',
            leaderboard: [...currentArena.entries]
              .sort((a, b) => b.pnl - a.pnl)
              .map((entry, rank) => ({
                rank: rank + 1,
                agentName: entry.agentName,
                agentId: entry.agentId,
                tradeCount: entry.tradeCount,
                pnl: entry.pnl,
                pnlPercent: (entry.pnl / 100).toFixed(2),
              })),
          })}\n\n`));
          clearInterval(interval);
          setTimeout(() => {
            spectatorDisconnect(arenaId);
            controller.close();
          }, 2000);
        }
      }, 1500); // poll every 1.5s

      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        spectatorDisconnect(arenaId);
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
