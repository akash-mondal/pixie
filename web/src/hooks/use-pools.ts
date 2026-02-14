'use client';

import { useQuery } from '@tanstack/react-query';
import { listPools, getPoolWithDeposits, formatUsdc, type PoolInfo, type DepositInfo } from '@/lib/contract';

export interface Pool {
  poolId: number;
  creator: string;
  depositDeadline: number;
  minDepositors: number;
  maxDepositors: number;
  depositCount: number;
  totalDeposited: string;
  rewardAmount: string;
  resolved: boolean;
  totalWeight: string;
  status: 'OPEN' | 'READY' | 'REVEALED';
}

export interface Deposit {
  index: number;
  depositor: string;
  amount: string;
  tickLower: number;
  tickUpper: number;
  lockDays: number;
  revealed: boolean;
  claimed: boolean;
}

function formatPool(p: PoolInfo): Pool {
  return {
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
  };
}

function formatDeposit(d: DepositInfo): Deposit {
  return {
    index: d.index,
    depositor: d.depositor,
    amount: formatUsdc(d.amount),
    tickLower: d.tickLower,
    tickUpper: d.tickUpper,
    lockDays: d.lockDays,
    revealed: d.revealed,
    claimed: d.claimed,
  };
}

export function usePools() {
  return useQuery({
    queryKey: ['pools'],
    queryFn: async () => {
      const pools = await listPools();
      return pools.map(formatPool);
    },
    refetchInterval: 10000,
  });
}

export function usePool(poolId: number) {
  return useQuery({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      const { pool, deposits } = await getPoolWithDeposits(poolId);
      return {
        pool: formatPool(pool),
        deposits: deposits.map(formatDeposit),
      };
    },
    refetchInterval: 5000,
  });
}
