// sFUEL faucet — fund new wallets

import { Hono } from 'hono';
import { ethers } from 'ethers';
import { fundSfuel } from '../lib/pool-manager.js';

export const sfuelRoutes = new Hono();

const fundedAddresses = new Set<string>();

sfuelRoutes.post('/fund', async (c) => {
  const body = await c.req.json();
  const address = body.address;

  if (!address || !ethers.isAddress(address)) {
    return c.json({ error: 'Valid address required' }, 400);
  }

  if (fundedAddresses.has(address.toLowerCase())) {
    return c.json({ funded: false, message: 'Already funded' });
  }

  try {
    const result = await fundSfuel(address);
    if (result.funded) {
      fundedAddresses.add(address.toLowerCase());
    }
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message || 'Fund failed' }, 500);
  }
});
