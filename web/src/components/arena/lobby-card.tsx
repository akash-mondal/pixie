'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { getRiskBadge } from '@/lib/system-agents';
import type { TickEvent } from '@/lib/agent-loop';
import { AVATAR_URL, STEP_ORDER, STEP_LABELS, STEP_LABELS_SHORT, stepProgress, ExplorerLink, LockIcon } from './shared';

interface LobbyCardProps {
  agent: any;
  isOwned: boolean;
  events: TickEvent[];
  index: number;
}

export function LobbyCard({ agent, isOwned, events, index }: LobbyCardProps) {
  const readyStep = agent.readyStep || 'pending';
  const isReady = readyStep === 'ready';
  const accentColor = agent.accentColor || '#888';
  const config = agent.config;
  const riskBadge = config ? getRiskBadge(config.riskTolerance) : null;

  // Extract tx hashes from lobby events for this agent
  const lobbyTxMap: Record<string, string> = {};
  for (const evt of events) {
    const data = evt.data as any;
    if (data?.lobbyStep && data?.txHash) {
      lobbyTxMap[data.lobbyStep] = data.txHash;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden"
      style={{ borderLeftColor: isOwned ? accentColor : '#1a1a1a', borderLeftWidth: isOwned ? 3 : 1 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#111] border border-[#1a1a1a] shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AVATAR_URL(agent.agentName)} alt="" width={48} height={48} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[17px] text-[#ededed] font-medium truncate">{agent.agentName}</span>
            {isOwned && (
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded shrink-0">YOU</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-mono" style={{ color: accentColor }}>{agent.archetype}</span>
            {agent.identityId > 0 && (
              <span className="text-[11px] font-mono text-[#666]">ID #{agent.identityId}</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-2">
        <div className="w-full h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: isReady ? '#22c55e' : accentColor }}
            initial={{ width: 0 }}
            animate={{ width: `${stepProgress(readyStep)}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {/* Step pipeline */}
      <div className="px-4 pb-3 space-y-1.5">
        {STEP_ORDER.slice(1).map((step) => {
          const currentIdx = STEP_ORDER.indexOf(readyStep);
          const stepIdx = STEP_ORDER.indexOf(step);
          const isDone = currentIdx >= stepIdx;
          const isCurrent = currentIdx === stepIdx - 1;
          const txHash = lobbyTxMap[step];

          return (
            <div key={step} className="flex items-center gap-2.5 text-[13px] font-mono">
              {/* Status icon */}
              <span className={`w-4 text-center ${
                isDone ? 'text-green-400' : isCurrent ? 'text-yellow-400' : 'text-[#333]'
              }`}>
                {isDone ? '\u2713' : isCurrent ? '\u25B6' : '\u00B7'}
              </span>

              {/* Step label */}
              <span className={`flex-1 ${
                isDone ? 'text-[#999]' : isCurrent ? 'text-[#ededed] font-medium' : 'text-[#444]'
              }`}>
                {isDone ? STEP_LABELS_SHORT[step] : isCurrent ? STEP_LABELS[step] : STEP_LABELS[step]}
              </span>

              {/* TX hash link */}
              {isDone && txHash && (
                <ExplorerLink hash={txHash} />
              )}
            </div>
          );
        })}
      </div>

      {/* Risk params (if available) */}
      {config && (isOwned || isReady) && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {riskBadge && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                style={{ color: riskBadge.color, borderColor: `${riskBadge.color}33`, backgroundColor: `${riskBadge.color}08` }}>
                Risk {config.riskTolerance}/10
              </span>
            )}
            <span className="text-[10px] font-mono text-[#666] bg-[#111] px-2 py-0.5 rounded">SL {config.stopLoss}%</span>
            <span className="text-[10px] font-mono text-[#666] bg-[#111] px-2 py-0.5 rounded">DD {config.maxDrawdown}%</span>
            <span className="text-[10px] font-mono text-[#666] bg-[#111] px-2 py-0.5 rounded">TP {config.takeProfit}%</span>
          </div>
        </div>
      )}

      {/* Trading pairs */}
      {config?.tradingPairs && config.tradingPairs.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {config.tradingPairs.map((pair: string) => (
              <span key={pair} className="text-[10px] font-mono text-[#888] bg-[#111] px-2 py-0.5 rounded border border-[#1a1a1a]">{pair}</span>
            ))}
          </div>
        </div>
      )}

      {/* Personality — full text, no truncation */}
      {agent.personality && (
        <div className="px-4 pb-4">
          <p className="text-[12px] text-[#999] font-mono leading-relaxed">
            {agent.personality}
          </p>
        </div>
      )}
    </motion.div>
  );
}
