'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { TickEvent } from '@/lib/agent-loop';
import { AgentDot, ExplorerLink, relativeTime } from './shared';

interface ActivityFeedProps {
  events: TickEvent[];
  lobbyAgents: any[];
  userAgentId: string;
}

const EVENT_ICONS: Record<string, string> = {
  analyzing: '\u25CB',  // circle
  decision: '\u25B6',   // play
  encrypting: '\u25C8', // diamond
  executed: '\u2713',   // check
  hold: '\u2500',       // dash
  stop: '\u25A0',       // square
  error: '\u2717',      // x
  recording: '\u25CF',  // filled circle
  'x402-purchase': '$',
  'sealed-order': '\u25C6', // filled diamond — sealed conviction order
  'depositing': '\u2193',   // down arrow — token deposit
};

// Drip-feed hook: takes raw events and reveals them one-by-one with a delay
function useDripFeed(events: TickEvent[], intervalMs = 120) {
  const [displayed, setDisplayed] = useState<TickEvent[]>([]);
  const queueRef = useRef<TickEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processedCount = useRef(0);

  // When new events arrive, queue the new ones
  useEffect(() => {
    if (events.length <= processedCount.current) return;
    const newEvents = events.slice(processedCount.current);
    processedCount.current = events.length;
    queueRef.current.push(...newEvents);
  }, [events, events.length]);

  // Process queue one item at a time
  useEffect(() => {
    if (timerRef.current) return; // already running

    const tick = () => {
      if (queueRef.current.length === 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }
      const next = queueRef.current.shift()!;
      setDisplayed(prev => {
        const updated = [...prev, next];
        // Keep last 100
        return updated.length > 100 ? updated.slice(-100) : updated;
      });
    };

    timerRef.current = setInterval(tick, intervalMs);
    // Process first one immediately
    tick();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [events.length, intervalMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return displayed;
}

export function ActivityFeed({ events, lobbyAgents, userAgentId }: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleEvents = useDripFeed(events, 120);

  // No auto-scroll — let user scroll manually to see latest events

  const getAgentColor = useCallback((agentId: string) => {
    const agent = lobbyAgents.find((a: any) => a.agentId === agentId);
    return agent?.accentColor || '#888';
  }, [lobbyAgents]);

  const getAgentName = (agentId: string, agentName: string) => {
    if (agentId === 'system') return 'PIXIE';
    return agentName || agentId.slice(0, 8);
  };

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
      {visibleEvents.length === 0 && (
        <div className="text-[12px] font-mono text-[#444] text-center py-8">
          waiting for activity...
        </div>
      )}
      {visibleEvents.map((evt, i) => {
        const isSystem = evt.agentId === 'system';
        const isOwned = evt.agentId === userAgentId;
        const color = isSystem ? '#eab308' : getAgentColor(evt.agentId);
        const swapTxHash = (evt.data as any)?.swapTxHash || (evt.data as any)?.submitTxHash;
        const isMarketMover = isSystem && (evt.data as any)?.marketMover;
        const isSealedOrder = evt.type === 'sealed-order';

        // Sealed conviction orders get a special multi-line card
        if (isSealedOrder) {
          return (
            <motion.div
              key={`${evt.timestamp}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="bg-yellow-500/[0.06] border border-yellow-500/20 border-l-2 border-l-yellow-500/50 rounded-lg p-3 my-1.5 -mx-1"
            >
              <div className="flex items-center gap-2 mb-2">
                <AgentDot color={color} size={6} />
                <span className={`text-[12px] font-medium ${isOwned ? 'text-cyan-400' : 'text-[#ccc]'}`}>
                  {getAgentName(evt.agentId, evt.agentName)}
                </span>
                <span className="text-[10px] font-mono text-yellow-400 bg-yellow-500/15 px-2 py-0.5 rounded tracking-wider">
                  SEALED CONVICTION ORDER
                </span>
                <span className="ml-auto text-[11px] text-[#444] tabular-nums">
                  {relativeTime(evt.timestamp)}
                </span>
              </div>
              <div className="text-[12px] font-mono text-[#ccc] leading-relaxed mb-2">
                {evt.message}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {(evt.data as any)?.encrypted && (
                  <span className="text-[10px] font-mono text-yellow-500/30">
                    {(evt.data as any).encrypted}
                  </span>
                )}
                {swapTxHash && <ExplorerLink hash={swapTxHash} label="sealed tx" />}
                <span className="text-[10px] font-mono text-yellow-500/40">executes at reveal</span>
              </div>
            </motion.div>
          );
        }

        return (
          <motion.div
            key={`${evt.timestamp}-${i}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`flex items-start gap-2.5 py-1.5 text-[12px] font-mono leading-tight ${
              isMarketMover ? 'bg-yellow-500/[0.03] -mx-3 px-3 rounded' : ''
            }`}
          >
            {/* Timestamp */}
            <span className="text-[#444] shrink-0 w-8 text-right tabular-nums text-[11px]">
              {relativeTime(evt.timestamp)}
            </span>

            {/* Agent dot */}
            <AgentDot color={color} size={6} />

            {/* Name */}
            <span className={`shrink-0 w-24 truncate font-medium ${
              isSystem ? 'text-yellow-500/70' :
              isOwned ? 'text-cyan-400' :
              'text-[#888]'
            }`}>
              {getAgentName(evt.agentId, evt.agentName)}
            </span>

            {/* Icon */}
            <span className={`shrink-0 w-4 text-center ${
              evt.type === 'executed' ? 'text-green-400/70' :
              evt.type === 'error' ? 'text-red-400/70' :
              evt.type === 'x402-purchase' ? 'text-emerald-400/70' :
              evt.type === 'depositing' ? 'text-cyan-400/70' :
              'text-[#555]'
            }`}>
              {EVENT_ICONS[evt.type] || '\u00B7'}
            </span>

            {/* Message */}
            <span className={`flex-1 truncate ${
              isSystem ? 'text-[#999]' :
              evt.type === 'error' ? 'text-red-400/80' :
              'text-[#aaa]'
            }`}>
              {evt.message}
            </span>

            {/* Explorer link for executed trades */}
            {swapTxHash && (
              <span className="shrink-0">
                <ExplorerLink hash={swapTxHash} label="tx" />
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
