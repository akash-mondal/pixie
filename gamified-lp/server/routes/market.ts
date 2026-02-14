// Market data route — pool analytics

import { Hono } from 'hono';
import { getMarketData } from '../lib/pool-manager.js';

export const marketRoutes = new Hono();

marketRoutes.get('/pool-data', async (c) => {
  const data = await getMarketData();
  return c.json(data);
});
