'use client';

import Link from 'next/link';
import type { Pool } from '@/hooks/use-pools';
import { PoolTimer } from './pool-timer';

const STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'open', color: 'text-green-500' },
  READY: { label: 'sealed', color: 'text-yellow-500' },
  REVEALED: { label: 'revealed', color: 'text-[#ededed]' },
};

export function PoolCard({ pool }: { pool: Pool }) {
  const status = STATUS[pool.status] ?? STATUS.OPEN;
  const fill = (pool.depositCount / pool.maxDepositors) * 100;

  return (
    <Link href={`/pool/${pool.poolId}`}>
      <div className="border border-[#1a1a1a] rounded-lg p-4 hover:border-[#333] transition-colors cursor-pointer group">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-mono text-[#444]">#{pool.poolId}</span>
          <span className={`text-[11px] font-mono ${status.color}`}>{status.label}</span>
        </div>

        <div className="font-pixel text-[1.2rem] text-[#ededed] tracking-wider mb-3">
          ${pool.rewardAmount}
        </div>

        <div className="flex items-center gap-3 text-[12px] text-[#666] mb-3">
          <span>{pool.depositCount}/{pool.maxDepositors} agents</span>
          <span className="text-[#1a1a1a]">/</span>
          <span>${pool.totalDeposited} locked</span>
        </div>

        {/* Bar */}
        <div className="w-full h-px bg-[#1a1a1a] mb-3">
          <div className="h-px bg-[#ededed] transition-all" style={{ width: `${fill}%` }} />
        </div>

        {!pool.resolved && <PoolTimer deadline={pool.depositDeadline} />}
      </div>
    </Link>
  );
}
