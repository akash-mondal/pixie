'use client';

import { useEffect, useCallback, useState } from 'react';
import { ChatBubbleStack } from './chat-bubble';

// --- Types ---

export interface AgentTradeEntry {
  action: string;
  pair: string;
  amount: string;
  direction: 'buy' | 'sell';
  timestamp: number;
}

export interface AgentX402Activity {
  bought: number;
  sold: number;
  totalUsd: number;
  lastIntel?: { direction: string; confidence: number };
}

export interface ChatBubbleData {
  id: string;
  agentId: string;
  message: string;
  color: string;
  timestamp: number;
}

interface AgentCardProps {
  agentName: string;
  agentId: string;
  tradeCount: number;
  pnl: number;
  revealed: boolean;
  accentColor?: string;
  isActive?: boolean;
  lastEvent?: string;
  lastEventMessage?: string;
  personality?: string;
  riskTolerance?: number;
  trades?: AgentTradeEntry[];
  x402?: AgentX402Activity;
  exposure?: number;
  reasoning?: string;
  chatBubbles?: ChatBubbleData[];
  onDismissBubble?: (id: string) => void;
  isWinner?: boolean;
  rank?: number;
}

// --- Helpers ---

const AVATAR_URL = (name: string) =>
  `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(name)}&size=80&backgroundColor=0a0a0a`;

function getRiskBadge(risk?: number): { label: string; color: string; bg: string } {
  if (!risk || risk <= 3) return { label: 'Conservative', color: 'text-blue-400', bg: 'bg-blue-400/10' };
  if (risk <= 5) return { label: 'Moderate', color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
  if (risk <= 7) return { label: 'Aggressive', color: 'text-orange-400', bg: 'bg-orange-400/10' };
  return { label: 'Degen', color: 'text-red-400', bg: 'bg-red-400/10' };
}

function getExposureColor(pct: number) {
  if (pct <= 30) return '#3b82f6';
  if (pct <= 60) return '#22c55e';
  if (pct <= 90) return '#f97316';
  return '#ef4444';
}

function getStatusConfig(lastEvent?: string) {
  switch (lastEvent) {
    case 'analyzing':
      return { label: 'Analyzing', dot: 'bg-green-500 animate-pulse', border: 'border-green-500/20' };
    case 'encrypting':
      return { label: 'Encrypting', dot: 'bg-yellow-500 animate-[pulse_0.5s_ease-in-out_infinite]', border: 'border-yellow-500/20' };
    case 'executed':
      return { label: 'Executed', dot: 'bg-cyan-400', border: 'border-cyan-400/20' };
    case 'x402-purchase':
      return { label: 'Trading intel', dot: 'bg-emerald-400 animate-pulse', border: 'border-emerald-400/20' };
    case 'hold':
      return { label: 'Holding', dot: 'bg-[#555]', border: 'border-[#1a1a1a]' };
    case 'stop':
      return { label: 'Stopped', dot: 'bg-red-500', border: 'border-red-500/20' };
    case 'decision':
      return { label: 'Decided', dot: 'bg-cyan-400', border: 'border-[#1a1a1a]' };
    case 'recording':
      return { label: 'On-chain', dot: 'bg-cyan-400 animate-pulse', border: 'border-cyan-400/20' };
    default:
      return { label: 'Idle', dot: 'bg-[#333]', border: 'border-[#1a1a1a]' };
  }
}

// --- Component ---

export function AgentCard({
  agentName,
  agentId,
  tradeCount,
  pnl,
  revealed,
  accentColor = '#ededed',
  isActive = false,
  lastEvent,
  lastEventMessage,
  personality,
  riskTolerance,
  trades = [],
  x402 = { bought: 0, sold: 0, totalUsd: 0 },
  exposure = 0,
  reasoning,
  chatBubbles = [],
  onDismissBubble,
  isWinner = false,
  rank,
}: AgentCardProps) {
  const [showPnl, setShowPnl] = useState(false);
  const [displayPnl, setDisplayPnl] = useState(0);

  useEffect(() => {
    if (revealed && !showPnl) {
      setShowPnl(true);
      let frame = 0;
      const target = pnl / 100;
      const steps = 20;
      const interval = setInterval(() => {
        frame++;
        setDisplayPnl((target * frame) / steps);
        if (frame >= steps) {
          setDisplayPnl(target);
          clearInterval(interval);
        }
      }, 30);
      return () => clearInterval(interval);
    }
  }, [revealed, pnl, showPnl]);

  const status = getStatusConfig(lastEvent);
  const riskBadge = getRiskBadge(riskTolerance);
  const lastTrade = trades[trades.length - 1];

  const handleDismissBubble = useCallback((id: string) => {
    onDismissBubble?.(id);
  }, [onDismissBubble]);

  const isEncrypting = lastEvent === 'encrypting';

  return (
    <div
      className={`relative rounded-lg border transition-colors duration-300 overflow-hidden h-[420px] flex flex-col ${
        isWinner ? 'border-yellow-500/40 bg-yellow-500/5' :
        isEncrypting ? 'border-yellow-500/20 bg-[#0d0d00]' :
        `${status.border} bg-[#0a0a0a] hover:border-[#333]`
      }`}
      style={{ borderColor: isActive && !isWinner && !isEncrypting ? accentColor + '15' : undefined }}
    >
      {/* === Fixed header section === */}
      <div className="p-4 pb-0 flex-shrink-0">
        {/* Row 1: Avatar + Name + Risk + Status */}
        <div className="flex items-center gap-3 mb-2">
          <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-[#111] flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={AVATAR_URL(agentName)} alt={agentName} width={44} height={44} className="w-full h-full" />
            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ${status.dot} ring-2 ring-[#0a0a0a]`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isWinner && <span className="text-yellow-500 text-[14px]">&diams;</span>}
              {rank != null && rank > 0 && <span className="text-[11px] font-pixel text-[#555]">#{rank}</span>}
              <span className="text-[16px] font-medium truncate" style={{ color: accentColor }}>{agentName}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {riskTolerance != null && riskTolerance > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${riskBadge.color} ${riskBadge.bg} uppercase font-medium`}>
                  {riskBadge.label}
                </span>
              )}
              <span className="text-[11px] font-mono text-[#555]">{status.label}</span>
            </div>
          </div>
        </div>

        {/* Personality — always reserve space */}
        <div className="h-[20px] mb-2 overflow-hidden">
          {personality && (
            <div className="text-[12px] font-mono text-[#555] truncate italic">
              &ldquo;{personality}&rdquo;
            </div>
          )}
        </div>

        {/* Status slot — fixed height for bubble/encrypting/status */}
        <div className="h-[22px] mb-2 overflow-hidden">
          {chatBubbles.length > 0 && onDismissBubble ? (
            <ChatBubbleStack bubbles={chatBubbles} onDismiss={handleDismissBubble} />
          ) : isEncrypting ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-yellow-500 animate-pulse">&#9670;</span>
              <span className="text-[13px] font-mono text-yellow-500/70 animate-pulse">ENCRYPTING TRADE...</span>
            </div>
          ) : lastEventMessage && lastEvent !== 'hold' ? (
            <div className="text-[12px] font-mono text-[#555] truncate">{lastEventMessage}</div>
          ) : null}
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-mono text-[#666]">
              {tradeCount} trade{tradeCount !== 1 ? 's' : ''}
            </span>
            <span className="text-[12px] font-mono font-medium" style={{ color: exposure > 0 ? getExposureColor(exposure) : '#333' }}>
              {Math.round(exposure)}% deployed
            </span>
          </div>
          {lastTrade && (
            <span className={`text-[13px] font-mono font-medium ${lastTrade.direction === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
              {lastTrade.direction === 'buy' ? '\u2191' : '\u2193'} {lastTrade.pair} {lastTrade.amount}
            </span>
          )}
        </div>

        {/* Exposure bar — always present */}
        <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, exposure)}%`, backgroundColor: exposure > 0 ? getExposureColor(exposure) : 'transparent' }}
          />
        </div>

        {/* x402 intel — fixed slot */}
        <div className="h-[20px] overflow-hidden">
          {(x402.bought > 0 || x402.sold > 0) && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-mono text-emerald-400 font-medium">$</span>
              <span className="text-[12px] font-mono text-[#666]">
                {x402.bought > 0 && `${x402.bought} bought`}
                {x402.bought > 0 && x402.sold > 0 && ' \u00b7 '}
                {x402.sold > 0 && `${x402.sold} sold`}
                {x402.totalUsd > 0 && ` ($${x402.totalUsd.toFixed(2)})`}
              </span>
              {x402.lastIntel && (
                <span className={`text-[12px] font-mono font-medium ${x402.lastIntel.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
                  {x402.lastIntel.direction === 'bullish' ? '\u2191' : '\u2193'}{x402.lastIntel.confidence}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* P&L */}
        <div className="text-center py-2 border-t border-[#1a1a1a]/50 mt-2">
          {revealed ? (
            <div>
              <span className={`font-pixel text-[22px] tracking-wider ${displayPnl >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {displayPnl >= 0 ? '+' : ''}{(displayPnl * 100).toFixed(0)} bps
              </span>
              <span className={`text-[12px] font-mono ml-2 ${displayPnl >= 0 ? 'text-green-500/50' : 'text-red-400/50'}`}>
                ({displayPnl >= 0 ? '+' : ''}{displayPnl.toFixed(2)}%)
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span className="text-[13px] text-yellow-500/30">{'\u{1F512}'}</span>
              <span className="font-pixel text-[18px] tracking-[0.15em] text-[#2a2a2a] select-none">??? bps</span>
            </div>
          )}
        </div>
      </div>

      {/* === Scrollable detail section === */}
      <div className="flex-1 min-h-0 border-t border-[#1a1a1a]/50 overflow-y-auto">
        <div className="p-4 space-y-2">
          {reasoning && (
            <div>
              <div className="text-[11px] font-mono text-[#444] tracking-widest mb-1">REASONING</div>
              <div className="text-[12px] text-[#666] font-mono leading-relaxed line-clamp-3">{reasoning}</div>
            </div>
          )}

          {trades.length > 0 && (
            <div>
              <div className="text-[11px] font-mono text-[#444] tracking-widest mb-1">TRADES</div>
              <div className="space-y-0.5">
                {trades.slice(-4).map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px] font-mono">
                    <span className={t.direction === 'buy' ? 'text-green-400' : 'text-red-400'}>
                      {t.direction === 'buy' ? '\u2191' : '\u2193'}
                    </span>
                    <span className="text-[#777]">{t.action}</span>
                    <span className="text-[#555]">{t.pair}</span>
                    <span className="text-[#444] ml-auto">{t.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {riskTolerance != null && (
            <div className="text-[12px] font-mono text-[#444]">
              risk {riskTolerance}/10 &middot; {Math.round(exposure)}% deployed
            </div>
          )}

          {isWinner && revealed && (
            <a
              href={`/agents?deploy=${encodeURIComponent(agentName)}`}
              className="block w-full py-2 text-center text-[13px] font-mono font-medium text-[#0a0a0a] bg-yellow-500 rounded hover:bg-yellow-400 transition-colors"
            >
              Deploy This Strategy
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
