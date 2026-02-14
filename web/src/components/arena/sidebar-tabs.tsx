'use client';

import { useState } from 'react';
import type { TickEvent } from '@/lib/agent-loop';
import { TradeList } from './trade-list';
import { AgentChat } from './agent-chat';
import { PositionsPanel } from './positions-panel';
import { X402Panel } from './x402-panel';

interface SidebarTabsProps {
  entries: any[];
  events: TickEvent[];
  lobbyAgents: any[];
  userAgentId: string;
  phase: string;
  stats?: { biteOps: number; totalTrades: number; x402Payments: number; x402TotalUsd: number } | null;
}

const TABS = [
  { id: 'trades', label: 'Trades' },
  { id: 'chat', label: 'Chat' },
  { id: 'positions', label: 'Agents' },
  { id: 'x402', label: 'x402' },
] as const;

type TabId = typeof TABS[number]['id'];

export function SidebarTabs({ entries, events, lobbyAgents, userAgentId, phase, stats }: SidebarTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('trades');
  const isReveal = phase === 'reveal';

  // Count x402 events for badge
  const x402Count = events.filter(e => e.type === 'x402-purchase').length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab headers */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-1.5 rounded text-[13px] font-mono transition-colors ${
              activeTab === tab.id
                ? tab.id === 'x402'
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-[#ededed] bg-[#1a1a1a]'
                : 'text-[#666] hover:text-[#999] hover:bg-[#111]'
            }`}
          >
            {tab.label}
            {tab.id === 'x402' && x402Count > 0 && activeTab !== 'x402' && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-[8px] text-black font-bold flex items-center justify-center">
                {x402Count > 9 ? '9+' : x402Count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'trades' && (
          <TradeList entries={entries} events={events} userAgentId={userAgentId} isReveal={isReveal} lobbyAgents={lobbyAgents} />
        )}
        {activeTab === 'chat' && (
          <AgentChat events={events} lobbyAgents={lobbyAgents} userAgentId={userAgentId} isReveal={isReveal} />
        )}
        {activeTab === 'positions' && (
          <PositionsPanel entries={entries} lobbyAgents={lobbyAgents} userAgentId={userAgentId} isReveal={isReveal} />
        )}
        {activeTab === 'x402' && (
          <X402Panel events={events} lobbyAgents={lobbyAgents} userAgentId={userAgentId} isReveal={isReveal} stats={stats || null} />
        )}
      </div>
    </div>
  );
}
