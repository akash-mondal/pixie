'use client';

import { motion } from 'framer-motion';
import { LobbyCard } from './lobby-card';
import type { TickEvent } from '@/lib/agent-loop';

interface LobbyViewProps {
  lobbyAgents: any[];
  userAgentId: string;
  events: TickEvent[];
  stats: { biteOps?: number; totalTrades?: number; x402Payments?: number; x402TotalUsd?: number };
}

export function LobbyView({ lobbyAgents, userAgentId, events, stats }: LobbyViewProps) {
  const readyCount = lobbyAgents.filter((a: any) => a.readyStep === 'ready').length;
  const totalCount = lobbyAgents.length;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      {/* Status header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="font-pixel text-[22px] text-yellow-400 tracking-wider mb-2">
          LOADING AGENTS
        </div>
        <div className="text-[12px] font-mono text-[#666]">
          {readyCount}/{totalCount} agents ready
          {readyCount < totalCount && (
            <span className="text-yellow-500/60 ml-2 animate-pulse">
              preparing encrypted strategies...
            </span>
          )}
        </div>

        {/* Global progress bar */}
        <div className="max-w-[400px] mx-auto mt-4">
          <div className="w-full h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-yellow-500/80"
              initial={{ width: 0 }}
              animate={{ width: totalCount > 0 ? `${(readyCount / totalCount) * 100}%` : '0%' }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Stats row */}
        {(stats.biteOps ?? 0) > 0 && (
          <div className="flex items-center justify-center gap-4 mt-4 text-[11px] font-mono text-[#555]">
            <span className="text-yellow-500/60">{stats.biteOps} BITE ops</span>
            {(stats.totalTrades ?? 0) > 0 && <span>{stats.totalTrades} trades</span>}
          </div>
        )}
      </motion.div>

      {/* Agent cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 max-w-[1400px] mx-auto">
        {lobbyAgents.map((agent: any, i: number) => {
          const isOwned = agent.agentId === userAgentId;
          const agentEvents = events.filter(e => e.agentId === agent.agentId);

          return (
            <LobbyCard
              key={agent.agentId}
              agent={agent}
              isOwned={isOwned}
              events={agentEvents}
              index={i}
            />
          );
        })}
      </div>

      {/* Empty state */}
      {lobbyAgents.length === 0 && (
        <div className="text-center py-20">
          <div className="text-[13px] font-mono text-[#444] animate-pulse">
            waiting for agents to join...
          </div>
        </div>
      )}
    </div>
  );
}
