'use client';

import { CountdownTimer } from '@/components/match/countdown-timer';

interface TopBarProps {
  phase: string;
  mode?: string;
  connected: boolean;
  stats: { biteOps?: number; totalTrades?: number; x402Payments?: number; x402TotalUsd?: number };
  deadline: number;
  onChainId?: number;
  resolved?: boolean;
}

export function TopBar({ phase, mode, connected, stats, deadline, onChainId, resolved }: TopBarProps) {
  const phaseColors: Record<string, string> = {
    lobby: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5',
    trading: 'text-cyan-400 border-cyan-400/30 bg-cyan-400/5',
    reveal: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5',
  };

  return (
    <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-[#1a1a1a] bg-[#0a0a0a]/95 backdrop-blur-sm">
      {/* Left: Phase + Mode */}
      <div className="flex items-center gap-3">
        <span className={`font-pixel text-[13px] tracking-wider px-2.5 py-1 rounded border ${phaseColors[phase] || 'text-[#888] border-[#333]'}`}>
          {phase.toUpperCase()}
        </span>
        {mode && (
          <span className="text-[11px] font-mono text-[#555] uppercase tracking-wider">
            {mode}
          </span>
        )}
        {!connected && (
          <span className="text-[9px] font-mono text-red-500 animate-pulse flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            reconnecting
          </span>
        )}
      </div>

      {/* Right: Stats + Timer */}
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-4 text-[11px] font-mono">
          {(stats.biteOps ?? 0) > 0 && (
            <span className="text-yellow-500/80 flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-yellow-500/60">
                <rect x="2" y="4" width="6" height="4.5" rx="1" />
                <path d="M3 4V3a2 2 0 014 0v1" stroke="currentColor" fill="none" strokeWidth="0.8" />
              </svg>
              {stats.biteOps}
            </span>
          )}
          {(stats.totalTrades ?? 0) > 0 && (
            <span className="text-[#666]">{stats.totalTrades} trades</span>
          )}
          {(stats.x402Payments ?? 0) > 0 && (
            <span className="text-emerald-500/80">
              {stats.x402Payments} x402 <span className="text-emerald-400/50">${stats.x402TotalUsd?.toFixed(2)}</span>
            </span>
          )}
          {onChainId != null && onChainId > 0 && (
            <span className="text-[#444]">#{onChainId}</span>
          )}
        </div>

        {phase === 'trading' && deadline > 0 && (
          <CountdownTimer deadline={deadline} resolved={!!resolved} inline />
        )}
      </div>
    </div>
  );
}
