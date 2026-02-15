'use client';

import type { TickEvent } from '@/lib/agent-loop';
import { AgentDot, DirectionArrow, ExplorerLink, LockIcon, relativeTime, bpsToUsd } from './shared';

interface TradeListProps {
  entries: any[];
  events: TickEvent[];
  userAgentId: string;
  isReveal: boolean;
  lobbyAgents: any[];
}

export function TradeList({ entries, events, userAgentId, isReveal, lobbyAgents }: TradeListProps) {
  // Collect trades from events (executed events have trade data)
  const executedEvents = events.filter(e => e.type === 'executed');
  const sealedEvents = events.filter(e => e.type === 'sealed-order');

  // Also collect from entries.trades (for reveal phase)
  const allTrades: {
    agentId: string;
    agentName: string;
    color: string;
    direction: 'buy' | 'sell';
    pair: string;
    pnlBps: number;
    recordTxHash?: string;
    swapTxHash?: string;
    realSwap?: boolean;
    sealed?: boolean;
    sealedEncrypted?: string;
    reasoning?: string;
    timestamp: number;
    isOwned: boolean;
  }[] = [];

  if (isReveal) {
    // On reveal, show all trades from all agents
    for (const entry of entries) {
      const lobby = lobbyAgents.find((a: any) => a.agentId === entry.agentId);
      const color = lobby?.accentColor || '#888';
      if (entry.trades) {
        for (const trade of entry.trades) {
          allTrades.push({
            agentId: entry.agentId,
            agentName: entry.agentName,
            color,
            direction: trade.direction || 'buy',
            pair: trade.pair || 'ETH/USDC',
            pnlBps: trade.simulatedPnL || 0,
            recordTxHash: trade.recordTxHash,
            swapTxHash: trade.swapTxHash,
            realSwap: trade.realSwap,
            reasoning: trade.reasoning,
            timestamp: trade.timestamp || 0,
            isOwned: entry.agentId === userAgentId,
          });
        }
      }
    }
    allTrades.sort((a, b) => b.timestamp - a.timestamp);
  } else {
    // During trading: only user's trades from events
    for (const evt of executedEvents) {
      const isOwned = evt.agentId === userAgentId;
      const lobby = lobbyAgents.find((a: any) => a.agentId === evt.agentId);
      const color = lobby?.accentColor || '#888';
      const data = evt.data as any;
      allTrades.push({
        agentId: evt.agentId,
        agentName: evt.agentName,
        color,
        direction: data?.decision?.direction || 'buy',
        pair: data?.decision?.pair || 'ETH/USDC',
        pnlBps: data?.pnlBps || 0,
        recordTxHash: data?.recordTxHash,
        swapTxHash: data?.swapTxHash,
        realSwap: data?.realSwap,
        reasoning: isOwned ? data?.decision?.reasoning : undefined,
        timestamp: evt.timestamp,
        isOwned,
      });
    }
    // Add sealed orders from events
    for (const evt of sealedEvents) {
      const isOwned = evt.agentId === userAgentId;
      const lobby = lobbyAgents.find((a: any) => a.agentId === evt.agentId);
      const color = lobby?.accentColor || '#888';
      const data = evt.data as any;
      allTrades.push({
        agentId: evt.agentId,
        agentName: evt.agentName,
        color,
        direction: data?.decision?.direction || 'buy',
        pair: data?.decision?.pair || 'ETH/USDC',
        pnlBps: 0,
        swapTxHash: data?.submitTxHash,
        sealed: true,
        sealedEncrypted: data?.encrypted,
        reasoning: isOwned ? data?.decision?.reasoning : undefined,
        timestamp: evt.timestamp,
        isOwned,
      });
    }
    allTrades.sort((a, b) => b.timestamp - a.timestamp);
  }

  if (allTrades.length === 0) {
    return (
      <div className="text-[13px] font-mono text-[#444] text-center py-12">
        no trades yet
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#1a1a1a]">
      {allTrades.map((trade, i) => (
        <div key={`${trade.agentId}-${trade.timestamp}-${i}`} className={`px-3 py-3 hover:bg-[#0d0d0d] transition-colors ${
          trade.sealed ? 'border-l-2 border-l-yellow-500/30 bg-yellow-500/[0.02]' : ''
        }`}>
          {/* Row 1: Agent + Direction + Pair + P&L */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AgentDot color={trade.color} size={8} />
              <span className={`text-[13px] font-mono font-medium ${trade.isOwned ? 'text-cyan-400' : 'text-[#ccc]'}`}>
                {trade.agentName}
              </span>
              {trade.sealed ? (
                <span className="text-[10px] font-mono text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">SEALED</span>
              ) : (
                <DirectionArrow direction={trade.direction} />
              )}
              <span className="text-[13px] font-mono text-[#ededed]">
                {trade.pair}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              {trade.sealed ? (
                <span className="text-[11px] font-mono text-yellow-500/70">executes at reveal</span>
              ) : trade.isOwned || isReveal ? (
                <span className={`text-[13px] font-mono font-medium ${
                  trade.pnlBps > 0 ? 'text-green-400' : trade.pnlBps < 0 ? 'text-red-400' : 'text-[#888]'
                }`}>
                  {bpsToUsd(trade.pnlBps)}
                </span>
              ) : (
                <LockIcon size={10} />
              )}
              {trade.realSwap && !trade.sealed && (
                <span className="text-[10px] font-mono text-green-500/70 bg-green-500/10 px-1.5 py-0.5 rounded">REAL</span>
              )}
            </div>
          </div>

          {/* Row 2: Reasoning/encrypted + TX links */}
          <div className="flex items-center justify-between mt-1.5">
            <span className={`text-[11px] font-mono truncate flex-1 mr-2 ${trade.sealed ? 'text-yellow-500/50' : 'text-[#777]'}`}>
              {trade.sealed && trade.sealedEncrypted
                ? trade.sealedEncrypted.slice(0, 40) + '...'
                : (trade.isOwned || isReveal ? (trade.reasoning?.slice(0, 100) || '') : '')
              }
            </span>
            <div className="flex items-center gap-2.5 shrink-0">
              {trade.swapTxHash && <ExplorerLink hash={trade.swapTxHash} label={trade.sealed ? 'sealed' : 'swap'} />}
              <span className="text-[10px] font-mono text-[#555]">{relativeTime(trade.timestamp)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
