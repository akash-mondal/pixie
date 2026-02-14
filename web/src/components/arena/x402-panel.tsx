'use client';

import type { TickEvent } from '@/lib/agent-loop';
import { AgentDot, ExplorerLink, relativeTime, LockIcon } from './shared';

interface X402PanelProps {
  events: TickEvent[];
  lobbyAgents: any[];
  userAgentId: string;
  isReveal: boolean;
  stats: { x402Payments: number; x402TotalUsd: number } | null;
}

export function X402Panel({ events, lobbyAgents, userAgentId, isReveal, stats }: X402PanelProps) {
  const x402Events = events.filter(e => e.type === 'x402-purchase');

  const getAgentColor = (agentId: string) => {
    return lobbyAgents.find((a: any) => a.agentId === agentId)?.accentColor || '#888';
  };

  // Resolve agent display name from lobbyAgents (x402 emitter may use agentId as name)
  const resolveAgentName = (agentId: string, fallbackName: string) => {
    const agent = lobbyAgents.find((a: any) => a.agentId === agentId);
    return agent?.agentName || fallbackName;
  };

  const hasStatsButNoEvents = stats && stats.x402Payments > 0 && x402Events.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header badge */}
      <div className="px-3 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-mono text-emerald-400 font-medium">x402 Commerce</span>
            <span className="text-[10px] font-mono text-yellow-500/60 bg-yellow-500/8 px-1.5 py-0.5 rounded border border-yellow-500/15">
              BITE Phase 1
            </span>
          </div>
          {stats && stats.x402Payments > 0 && (
            <span className="text-[11px] font-mono text-emerald-400">
              {stats.x402Payments} txns &middot; ${stats.x402TotalUsd.toFixed(2)}
            </span>
          )}
        </div>
        <p className="text-[10px] font-mono text-[#555] mt-1.5 leading-relaxed">
          Agent-to-agent intelligence marketplace facilitated by RelAI Facilitator.
          Agents autonomously buy/sell market analysis via x402 payment protocol,
          encrypted under BITE threshold encryption.
        </p>
      </div>

      {/* Transaction list */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#0d0d0d]">
        {x402Events.length === 0 ? (
          <div className="px-3 py-6">
            {hasStatsButNoEvents ? (
              /* Stats available but individual events were lost (SSE reconnection) */
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-3">
                  <span className="text-emerald-400 text-[20px]">$</span>
                  <div>
                    <div className="text-[14px] font-mono text-emerald-400 font-medium">
                      {stats!.x402Payments} micropayments settled
                    </div>
                    <div className="text-[11px] font-mono text-[#888]">
                      ${stats!.x402TotalUsd.toFixed(2)} USDC total via x402
                    </div>
                  </div>
                </div>
                <div className="border border-[#1a1a1a] rounded-lg p-3 bg-[#0d0d0d]">
                  <div className="text-[10px] font-mono text-[#666] space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400/60">1.</span>
                      <span>Agent requests rival&apos;s market analysis</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400/60">2.</span>
                      <span>Server returns 402 Payment Required</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400/60">3.</span>
                      <span>Agent signs EIP-712 USDC authorization ($0.01)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400/60">4.</span>
                      <span>RelAI Facilitator settles on SKALE (zero gas)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400/60">5.</span>
                      <span>Intel delivered &mdash; encrypted under BITE</span>
                    </div>
                  </div>
                </div>
                <p className="text-[9px] font-mono text-[#444] text-center">
                  individual transactions stream in real-time during trading
                </p>
              </div>
            ) : (
              <div className="text-center">
                <span className="text-emerald-500/40 text-[18px] block mb-2">$</span>
                <div className="text-[12px] font-mono text-[#444]">
                  no x402 transactions yet
                </div>
                <p className="text-[10px] text-[#333] mt-2">
                  agents purchase intel from each other during trading
                </p>
              </div>
            )}
          </div>
        ) : (
          x402Events.map((evt, i) => {
            const data = evt.data as any;
            const isOwned = evt.agentId === userAgentId;
            const color = getAgentColor(evt.agentId);
            const displayName = resolveAgentName(evt.agentId, evt.agentName);
            const price = data?.price || 0.01;
            const targetName = data?.targetAgentName || (data?.targetAgentId ? resolveAgentName(data.targetAgentId, 'rival agent') : 'rival agent');
            const isSuccess = data?.settled;
            const isError = !!data?.error;
            const txHash = data?.txHash || data?.paymentTxHash;
            const showDetail = isOwned || isReveal;

            return (
              <div key={`x402-${evt.timestamp}-${i}`} className="px-3 py-3 hover:bg-[#0d0d0d] transition-colors">
                {/* Row 1: Buyer → Seller + Amount */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <AgentDot color={color} size={8} />
                    <span className={`text-[13px] font-mono font-medium truncate ${isOwned ? 'text-cyan-400' : 'text-[#ccc]'}`}>
                      {displayName}
                    </span>
                    <span className="text-[10px] font-mono text-[#555] shrink-0">&rarr;</span>
                    <span className="text-[12px] font-mono text-emerald-400/70 truncate">
                      {targetName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[12px] font-mono text-emerald-400 font-medium">
                      ${price.toFixed(2)}
                    </span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                      isSuccess
                        ? 'text-emerald-400/80 bg-emerald-500/10'
                        : isError
                        ? 'text-yellow-400/80 bg-yellow-500/10'
                        : 'text-[#888] bg-[#111]'
                    }`}>
                      {isSuccess ? 'SETTLED' : isError ? 'FLOW' : 'x402'}
                    </span>
                  </div>
                </div>

                {/* Row 2: Message content */}
                <div className="mt-1.5 pl-5">
                  {showDetail ? (
                    <p className="text-[11px] font-mono text-[#888] leading-relaxed">
                      {evt.message}
                    </p>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <LockIcon size={9} />
                      <span className="text-[10px] font-mono text-yellow-500/30 tracking-wider">
                        BITE encrypted intelligence exchange
                      </span>
                    </div>
                  )}
                </div>

                {/* Row 3: TX link + timestamp */}
                <div className="flex items-center justify-between mt-1.5 pl-5">
                  <div className="flex items-center gap-2">
                    {txHash && <ExplorerLink hash={txHash} label="payment" />}
                    {data?.confidence && (
                      <span className="text-[9px] font-mono text-[#666]">
                        {data.confidence}% confidence
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-[#444]">{relativeTime(evt.timestamp)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
