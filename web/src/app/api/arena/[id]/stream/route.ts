// GET /api/arena/[id]/stream — SSE stream of arena agent events

import { NextRequest } from 'next/server';
import { getArenaStore } from '@/lib/arena-store';
import { spectatorConnect, spectatorDisconnect } from '@/lib/spectator-tracker';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: arenaId } = await params;
  const arenaStore = getArenaStore();
  const arena = arenaStore.get(arenaId);

  if (!arena) {
    return new Response('Arena not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  let lastEventIndex = 0;

  // Track this spectator
  spectatorConnect(arenaId);

  const stream = new ReadableStream({
    start(controller) {
      // Send existing events first
      for (const event of arena.events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      lastEventIndex = arena.events.length;

      // Poll for new events
      const interval = setInterval(() => {
        const currentArena = arenaStore.get(arenaId);
        if (!currentArena) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Arena not found' })}\n\n`));
          clearInterval(interval);
          spectatorDisconnect(arenaId);
          controller.close();
          return;
        }

        // Send new events
        while (lastEventIndex < currentArena.events.length) {
          const event = currentArena.events[lastEventIndex];
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          lastEventIndex++;
        }

        // Check if arena is done
        if (currentArena.resolved || Date.now() > currentArena.deadline) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'done',
            agentId: 'system',
            agentName: 'PIXIE',
            message: currentArena.resolved ? 'Arena resolved — all strategies revealed' : 'Arena deadline reached',
            timestamp: Date.now(),
            data: {
              resolved: currentArena.resolved,
              totalTrades: currentArena.totalTrades,
              biteOps: currentArena.biteOps,
              entries: currentArena.entries,
            },
          })}\n\n`));
          clearInterval(interval);
          spectatorDisconnect(arenaId);
          controller.close();
        }
      }, 1000); // Check every second

      // Cleanup on abort
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
