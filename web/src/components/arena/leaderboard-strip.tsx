'use client';

import { LockIcon, bpsToUsd } from './shared';

interface LeaderboardStripProps {
  entries: any[];
  userAgentId: string;
  isReveal: boolean;
}

export function LeaderboardStrip({ entries, userAgentId, isReveal }: LeaderboardStripProps) {
  const sorted = [...entries].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));

  if (sorted.length === 0) return null;

  return (
    <div className="h-11 shrink-0 flex items-center gap-1.5 px-3 border-t border-[#1a1a1a] bg-[#060606] overflow-x-auto">
      {sorted.map((entry, rank) => {
        const isMe = entry.agentId === userAgentId;
        const pnl = entry.pnl;
        const showPnl = isMe || isReveal || pnl != null;

        return (
          <div
            key={entry.agentId}
            className={`flex items-center gap-2 shrink-0 px-3 py-1.5 rounded text-[12px] font-mono transition-colors ${
              rank === 0 && showPnl
                ? 'text-yellow-400 bg-yellow-500/[0.06] border border-yellow-500/20'
                : isMe
                ? 'text-cyan-400 bg-cyan-500/[0.06] border border-cyan-500/20'
                : 'text-[#888] border border-transparent'
            }`}
          >
            <span className={rank === 0 && showPnl ? 'text-yellow-500/70' : 'text-[#666]'}>#{rank + 1}</span>
            <span className={isMe ? 'text-cyan-300' : 'text-[#ededed]'}>{entry.agentName}</span>
            {showPnl ? (
              <span className={`font-medium ${(pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {bpsToUsd(pnl ?? 0)}
              </span>
            ) : (
              <LockIcon size={10} />
            )}
          </div>
        );
      })}
    </div>
  );
}
