// Agent routes — run agent + SSE event stream

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { runAgent, type AgentRunEvent } from '../lib/pool-manager.js';

export const agentRoutes = new Hono();

// Store events per run ID for SSE polling
const runEvents = new Map<string, AgentRunEvent[]>();
let runCounter = 0;

agentRoutes.post('/run', async (c) => {
  const body = await c.req.json();
  const { poolId, agentType, depositAmount } = body;

  if (!poolId && poolId !== 0) return c.json({ error: 'poolId required' }, 400);
  if (!agentType) return c.json({ error: 'agentType required' }, 400);

  const runId = `run-${++runCounter}-${Date.now()}`;
  const events: AgentRunEvent[] = [];
  runEvents.set(runId, events);

  // Run agent in background, collecting events
  (async () => {
    try {
      for await (const event of runAgent(poolId, agentType, depositAmount ?? 0.20)) {
        events.push(event);
      }
    } catch (err: any) {
      events.push({ type: 'error', message: err.message || 'Agent run failed' });
    }
  })();

  return c.json({ runId });
});

agentRoutes.get('/events', async (c) => {
  const runId = c.req.query('runId');
  if (!runId) return c.json({ error: 'runId required' }, 400);

  const events = runEvents.get(runId);
  if (!events) return c.json({ error: 'Run not found' }, 404);

  return streamSSE(c, async (stream) => {
    let lastIndex = 0;

    for (let tick = 0; tick < 120; tick++) {
      // Send any new events
      while (lastIndex < events.length) {
        const event = events[lastIndex];
        await stream.writeSSE({
          data: JSON.stringify(event),
          event: event.type,
          id: String(lastIndex),
        });
        lastIndex++;

        if (event.type === 'done' || event.type === 'error') {
          // Clean up after a delay
          setTimeout(() => runEvents.delete(runId), 30000);
          return;
        }
      }

      await stream.sleep(500);
    }
  });
});
