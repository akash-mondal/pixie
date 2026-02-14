'use client';

import { useRef, useEffect, useState } from 'react';
import type { TickEvent } from '@/lib/agent-loop';
import { AVATAR_URL, AgentDot, LockIcon, relativeTime } from './shared';

interface AgentChatProps {
  events: TickEvent[];
  lobbyAgents: any[];
  userAgentId: string;
  isReveal: boolean;
}

export function AgentChat({ events, lobbyAgents, userAgentId, isReveal }: AgentChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter to reasoning-type events
  const chatEvents = events.filter(e =>
    e.type === 'decision' || e.type === 'hold' || e.type === 'analyzing' ||
    e.type === 'stop' || e.type === 'x402-purchase'
  ).filter(e => e.agentId !== 'system');

  // No auto-scroll — let user scroll manually

  const getAgentColor = (agentId: string) => {
    return lobbyAgents.find((a: any) => a.agentId === agentId)?.accentColor || '#888';
  };

  if (chatEvents.length === 0) {
    return (
      <div className="text-[13px] font-mono text-[#444] text-center py-12">
        waiting for agent decisions...
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="divide-y divide-[#0d0d0d]">
      {chatEvents.slice(-60).map((evt, i) => {
        const isOwned = evt.agentId === userAgentId;
        const color = getAgentColor(evt.agentId);
        const data = evt.data as any;
        const reasoning = data?.decision?.reasoning || evt.message;
        const showContent = isOwned || isReveal;

        return (
          <div key={`${evt.timestamp}-${i}`} className="px-3 py-3 hover:bg-[#0d0d0d] transition-colors">
            {/* Agent header */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded overflow-hidden bg-[#111] shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={AVATAR_URL(evt.agentName)} alt="" width={24} height={24} />
                </div>
                <span className="text-[13px] font-mono font-medium" style={{ color }}>
                  {evt.agentName}
                </span>
                {evt.type === 'decision' && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    data?.decision?.direction === 'buy'
                      ? 'text-green-400/80 bg-green-500/10'
                      : data?.decision?.direction === 'sell'
                      ? 'text-red-400/80 bg-red-500/10'
                      : 'text-[#666] bg-[#111]'
                  }`}>
                    {data?.decision?.direction?.toUpperCase() || evt.type.toUpperCase()}
                  </span>
                )}
                {evt.type === 'hold' && (
                  <span className="text-[10px] font-mono text-[#666] bg-[#111] px-1.5 py-0.5 rounded">HOLD</span>
                )}
                {evt.type === 'x402-purchase' && (
                  <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded">x402</span>
                )}
              </div>
              <span className="text-[10px] font-mono text-[#555]">{relativeTime(evt.timestamp)}</span>
            </div>

            {/* Content */}
            {showContent ? (
              <div className="text-[12px] font-mono text-[#aaa] leading-relaxed pl-8">
                {reasoning?.slice(0, 200)}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 pl-8">
                <LockIcon size={10} />
                <span className="text-[11px] font-mono text-yellow-500/30 tracking-wider">
                  BITE encrypted reasoning
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
