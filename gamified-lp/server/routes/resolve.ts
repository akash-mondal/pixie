// Resolve route — trigger batch CTX reveal

import { Hono } from 'hono';
import { resolvePool, getPool } from '../lib/pool-manager.js';

export const resolveRoutes = new Hono();

resolveRoutes.post('/:id/resolve', async (c) => {
  const poolId = Number(c.req.param('id'));

  try {
    const pool = await getPool(poolId);
    if (pool.resolved) {
      return c.json({ error: 'Pool already resolved' }, 400);
    }

    const txHash = await resolvePool(poolId);

    // Wait for resolution (poll)
    let resolved = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const updated = await getPool(poolId);
      if (updated.resolved) {
        resolved = true;
        break;
      }
    }

    return c.json({ txHash, resolved, poolId });
  } catch (err: any) {
    return c.json({ error: err.message || 'Resolve failed' }, 500);
  }
});
