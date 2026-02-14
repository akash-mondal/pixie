'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getRiskBadge } from '@/lib/system-agents';
import { AVATAR_URL, AgentDot, LockIcon, ExplorerLink, CipherText } from './shared';

interface PositionsPanelProps {
  entries: any[];
  lobbyAgents: any[];
  userAgentId: string;
  isReveal: boolean;
}

export function PositionsPanel({ entries, lobbyAgents, userAgentId, isReveal }: PositionsPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(userAgentId);

  if (lobbyAgents.length === 0) {
    return (
      <div className="text-[10px] font-mono text-[#333] text-center py-12">
        no agents loaded
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#1a1a1a]">
      {lobbyAgents.map((agent: any) => {
        const entry = entries.find((e: any) => e.agentId === agent.agentId);
        const isOwned = agent.agentId === userAgentId;
        const showDetail = isOwned || isReveal;
        const isExpanded = expanded === agent.agentId;
        const config = agent.config;
        const pnl = entry?.pnl;
        const riskBadge = config ? getRiskBadge(config.riskTolerance) : null;

        return (
          <div key={agent.agentId}>
            {/* Agent header row — always visible */}
            <button
              onClick={() => setExpanded(isExpanded ? null : agent.agentId)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#0d0d0d] transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-7 h-7 rounded overflow-hidden bg-[#111]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={AVATAR_URL(agent.agentName)} alt="" width={28} height={28} />
                  </div>
                  {entry?.stopped && (
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 border border-[#0a0a0a]" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-[#ededed]">{agent.agentName}</span>
                    {isOwned && (
                      <span className="text-[8px] font-mono text-cyan-400 bg-cyan-500/10 px-1 rounded">YOU</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono" style={{ color: agent.accentColor }}>
                      {agent.archetype}
                    </span>
                    {agent.identityId > 0 && (
                      <span className="text-[8px] font-mono text-[#444]">#{agent.identityId}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[9px] font-mono text-[#555]">
                  {entry?.tradeCount || 0}t
                </span>
                {showDetail && pnl != null ? (
                  <span className={`text-[11px] font-mono ${
                    pnl > 0 ? 'text-green-400' : pnl < 0 ? 'text-red-400' : 'text-[#888]'
                  }`}>
                    {pnl > 0 ? '+' : ''}{pnl}
                  </span>
                ) : (
                  <LockIcon size={9} />
                )}
                <svg
                  width="10" height="10" viewBox="0 0 10 10" fill="none"
                  className={`text-[#555] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                >
                  <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </div>
            </button>

            {/* Expanded detail */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 space-y-2">
                    {/* Risk params */}
                    {showDetail && config ? (
                      <>
                        <div className="flex flex-wrap gap-1">
                          {riskBadge && (
                            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border"
                              style={{ color: riskBadge.color, borderColor: `${riskBadge.color}33`, backgroundColor: `${riskBadge.color}08` }}>
                              Risk {config.riskTolerance}/10
                            </span>
                          )}
                          <span className="text-[8px] font-mono text-[#666] bg-[#111] px-1.5 py-0.5 rounded">SL {config.stopLoss}%</span>
                          <span className="text-[8px] font-mono text-[#666] bg-[#111] px-1.5 py-0.5 rounded">DD {config.maxDrawdown}%</span>
                          <span className="text-[8px] font-mono text-[#666] bg-[#111] px-1.5 py-0.5 rounded">TP {config.takeProfit}%</span>
                          <span className="text-[8px] font-mono text-[#666] bg-[#111] px-1.5 py-0.5 rounded">{config.executionSpeed}</span>
                          {config.contrarian && (
                            <span className="text-[8px] font-mono text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">contrarian</span>
                          )}
                        </div>

                        {/* Trading pairs */}
                        {config.tradingPairs && (
                          <div className="flex gap-1">
                            {config.tradingPairs.map((p: string) => (
                              <span key={p} className="text-[8px] font-mono text-cyan-400/50 bg-cyan-500/10 px-1.5 py-0.5 rounded">{p}</span>
                            ))}
                          </div>
                        )}

                        {/* Personality */}
                        <div className="text-[9px] font-mono text-[#777] leading-relaxed">
                          {agent.personality?.slice(0, 120)}
                        </div>

                        {/* Stop reason */}
                        {entry?.stopped && entry?.stopReason && (
                          <div className="text-[9px] font-mono text-red-400/80 bg-red-500/5 px-2 py-1 rounded">
                            Stopped: {entry.stopReason}
                          </div>
                        )}

                        {/* Wallet + on-chain links */}
                        <div className="flex items-center gap-2 text-[8px] font-mono text-[#444]">
                          {agent.walletAddress && (
                            <span>{agent.walletAddress.slice(0, 8)}...{agent.walletAddress.slice(-4)}</span>
                          )}
                          {entry?.joinTxHash && <ExplorerLink hash={entry.joinTxHash} label="join" />}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 py-2">
                        <LockIcon size={9} />
                        <CipherText length={48} />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
