// Pool routes — list, detail, create

import { Hono } from 'hono';
import { listPools, getPoolWithDeposits, createPool } from '../lib/pool-manager.js';
import { formatUsdc } from '../../src/config.js';

export const poolRoutes = new Hono();

poolRoutes.get('/', async (c) => {
  const pools = await listPools();
  const formatted = pools.map((p) => ({
    poolId: p.poolId,
    creator: p.creator,
    depositDeadline: p.depositDeadline,
    minDepositors: p.minDepositors,
    maxDepositors: p.maxDepositors,
    depositCount: p.depositCount,
    totalDeposited: formatUsdc(p.totalDeposited),
    rewardAmount: formatUsdc(p.rewardAmount),
    resolved: p.resolved,
    totalWeight: p.totalWeight.toString(),
    status: p.resolved ? 'REVEALED' : p.depositCount >= p.minDepositors ? 'READY' : 'OPEN',
  }));
  return c.json({ pools: formatted });
});

poolRoutes.get('/:id', async (c) => {
  const poolId = Number(c.req.param('id'));
  const { pool, deposits } = await getPoolWithDeposits(poolId);

  return c.json({
    pool: {
      poolId,
      creator: pool.creator,
      depositDeadline: pool.depositDeadline,
      minDepositors: pool.minDepositors,
      maxDepositors: pool.maxDepositors,
      depositCount: pool.depositCount,
      totalDeposited: formatUsdc(pool.totalDeposited),
      rewardAmount: formatUsdc(pool.rewardAmount),
      resolved: pool.resolved,
      totalWeight: pool.totalWeight.toString(),
      status: pool.resolved ? 'REVEALED' : pool.depositCount >= pool.minDepositors ? 'READY' : 'OPEN',
    },
    deposits: deposits.map((d) => ({
      index: d.index,
      depositor: d.depositor,
      amount: formatUsdc(d.amount),
      tickLower: d.tickLower,
      tickUpper: d.tickUpper,
      lockDays: d.lockDays,
      revealed: d.revealed,
      claimed: d.claimed,
    })),
  });
});

poolRoutes.post('/create', async (c) => {
  const body = await c.req.json();
  const result = await createPool({
    rewardAmount: body.rewardAmount ?? 1.0,
    deadlineMinutes: body.deadlineMinutes ?? 10,
    minDepositors: body.minDepositors ?? 3,
    maxDepositors: body.maxDepositors ?? 5,
    minDeposit: body.minDeposit ?? 0.1,
    maxDeposit: body.maxDeposit ?? 1.0,
    gracePeriod: body.gracePeriod ?? 300,
  });
  return c.json({ poolId: result.poolId, txHash: result.txHash });
});
