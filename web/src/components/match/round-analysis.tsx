'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playSound } from '@/lib/sounds';
import type { AgentTradeEntry, AgentX402Activity } from './agent-card';
import type { TradeMarker } from './market-pulse';
import type { TickEvent } from '@/lib/agent-loop';

// --- Types ---

export interface AgentReveal {
  agentId: string;
  agentName: string;
  accentColor: string;
  personality?: string;
  riskTolerance?: number;
  trades: AgentTradeEntry[];
  x402: AgentX402Activity;
  exposure: number;
  reasoning?: string;
  pnl: number;
  tradeCount: number;
  rank: number;
}

interface BiteStep {
  step: string;
  label: string;
  count: number;
}

interface RoundAnalysisProps {
  agents: AgentReveal[];
  biteSteps: BiteStep[];
  x402Summary: { payments: number; totalUsd: number };
  priceHistory: Array<{ timestamp: number; ethPrice: number }>;
  tradeMarkers: TradeMarker[];
  biteOps: number;
  totalTrades: number;
  onBackToArena?: () => void;
  events: TickEvent[];
  matchCode: string;
  matchOnChainId?: number;
}

// --- Slide timing (ms) ---
const TIMING = {
  decrypt: 3000,
  lifecycle: 5000,
  encryption: 7000,
  x402: 7000,
  market: 5000,
  agent: 5000,
  proof: 12000,
};

const AVATAR_URL = (name: string) =>
  `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(name)}&size=80&backgroundColor=0a0a0a`;

// --- Cipher rain ---
const HEX = '0123456789abcdef';
function CipherRain() {
  const cols = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      left: `${(i / 40) * 100}%`,
      delay: Math.random() * 2,
      dur: 1 + Math.random() * 2,
      chars: Array.from({ length: 15 }, () => HEX[Math.floor(Math.random() * 16)]).join('\n'),
    })),
  []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
      {cols.map((c, i) => (
        <div
          key={i}
          className="absolute top-0 font-mono text-[10px] text-cyan-400 whitespace-pre leading-[1.2]"
          style={{ left: c.left, animation: `cipherFall ${c.dur}s linear ${c.delay}s infinite` }}
        >
          {c.chars}
        </div>
      ))}
      <style jsx>{`
        @keyframes cipherFall {
          0% { transform: translateY(-100%); opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// --- Helpers ---
function getRiskLabel(risk?: number) {
  if (!risk || risk <= 3) return { label: 'Conservative', color: 'text-blue-400' };
  if (risk <= 5) return { label: 'Moderate', color: 'text-yellow-400' };
  if (risk <= 7) return { label: 'Aggressive', color: 'text-orange-400' };
  return { label: 'Degen', color: 'text-red-400' };
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortHash(str: string): string {
  if (!str) return '';
  if (str.startsWith('0x') && str.length > 14) return `${str.slice(0, 8)}...${str.slice(-6)}`;
  if (str.length > 20) return `${str.slice(0, 10)}...${str.slice(-6)}`;
  return str;
}

// --- Processed event types ---
interface EncryptionEntry {
  timestamp: number;
  agentName: string;
  agentColor: string;
  action: 'seal' | 'trade';
  detail: string;
  encryptedHash?: string;
  txHash?: string;
}

interface X402Entry {
  timestamp: number;
  buyerName: string;
  buyerColor: string;
  sellerName: string;
  sellerColor: string;
  price: number;
  direction?: string;
  confidence?: number;
  settled: boolean;
}

// --- Component ---
export function RoundAnalysis({
  agents,
  biteSteps,
  x402Summary,
  priceHistory,
  tradeMarkers,
  biteOps,
  totalTrades,
  onBackToArena,
  events,
  matchCode,
  matchOnChainId,
}: RoundAnalysisProps) {
  // Color map from agents
  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach(a => m.set(a.agentId, a.accentColor));
    agents.forEach(a => m.set(a.agentName, a.accentColor));
    return m;
  }, [agents]);

  // Sort worst → best for dramatic reveal
  const sorted = useMemo(() => [...agents].sort((a, b) => a.pnl - b.pnl), [agents]);

  // Process encryption events
  const encryptionLog = useMemo<EncryptionEntry[]>(() => {
    const log: EncryptionEntry[] = [];
    for (const evt of events) {
      if (evt.type === 'encrypting') {
        log.push({
          timestamp: evt.timestamp,
          agentName: evt.agentName,
          agentColor: colorMap.get(evt.agentId) || colorMap.get(evt.agentName) || '#ededed',
          action: 'seal',
          detail: 'Strategy encrypted via BITE.encryptMessage()',
        });
      } else if (evt.type === 'executed') {
        const decision = evt.data?.decision as { pair?: string; direction?: string; amountPercent?: number } | undefined;
        const encrypted = evt.data?.encrypted as string | undefined;
        const txHash = evt.data?.recordTxHash as string | undefined;
        const pair = decision?.pair || 'ETH/USDC';
        const dir = decision?.direction === 'sell' ? 'SELL' : 'BUY';
        const amt = decision?.amountPercent ? `${decision.amountPercent}%` : '';
        log.push({
          timestamp: evt.timestamp,
          agentName: evt.agentName,
          agentColor: colorMap.get(evt.agentId) || colorMap.get(evt.agentName) || '#ededed',
          action: 'trade',
          detail: `${dir} ${pair} ${amt} — encrypted via bite.encryptTransaction()`,
          encryptedHash: encrypted,
          txHash: txHash,
        });
      }
    }
    return log.sort((a, b) => a.timestamp - b.timestamp);
  }, [events, colorMap]);

  // Process x402 events into paired transactions
  const x402Log = useMemo<X402Entry[]>(() => {
    const log: X402Entry[] = [];
    for (const evt of events) {
      if (evt.type !== 'x402-purchase') continue;
      const targetName = (evt.data?.targetAgentName as string) || '';
      const price = evt.data?.price as number | undefined;
      const direction = evt.data?.direction as string | undefined;
      const confidence = evt.data?.confidence as number | undefined;
      const settled = evt.data?.settled as boolean | undefined;

      if (price && price > 0) {
        log.push({
          timestamp: evt.timestamp,
          buyerName: evt.agentName,
          buyerColor: colorMap.get(evt.agentId) || colorMap.get(evt.agentName) || '#ededed',
          sellerName: targetName || 'unknown',
          sellerColor: colorMap.get(targetName) || '#ededed',
          price,
          direction: settled ? direction : undefined,
          confidence: settled ? confidence : undefined,
          settled: !!settled,
        });
      }
    }
    return log.sort((a, b) => a.timestamp - b.timestamp);
  }, [events, colorMap]);

  // Slides: decrypt(0) + lifecycle(1) + encryption(2) + x402(3) + market(4) + per-agent(5..N+4) + proof(N+5)
  const hasX402 = x402Log.length > 0;
  const slideOffsets = {
    decrypt: 0,
    lifecycle: 1,
    encryption: 2,
    x402: hasX402 ? 3 : -1,
    market: hasX402 ? 4 : 3,
    agentStart: hasX402 ? 5 : 4,
  };
  const total = slideOffsets.agentStart + sorted.length + 1; // +1 for proof/standings
  const [slide, setSlide] = useState(0);
  const [lcStep, setLcStep] = useState(0);

  // Auto-advance
  useEffect(() => {
    if (slide >= total - 1) return;

    let dur: number;
    if (slide === slideOffsets.decrypt) dur = TIMING.decrypt;
    else if (slide === slideOffsets.lifecycle) dur = TIMING.lifecycle;
    else if (slide === slideOffsets.encryption) dur = TIMING.encryption;
    else if (slide === slideOffsets.x402) dur = TIMING.x402;
    else if (slide === slideOffsets.market || slide === (hasX402 ? slideOffsets.market : slideOffsets.encryption + 1)) dur = TIMING.market;
    else if (slide >= slideOffsets.agentStart && slide < slideOffsets.agentStart + sorted.length) dur = TIMING.agent;
    else dur = TIMING.proof;

    const t = setTimeout(() => {
      setSlide(s => s + 1);
      if (slide > 0) playSound('tick');
    }, dur);
    return () => clearTimeout(t);
  }, [slide, total, sorted.length, slideOffsets.decrypt, slideOffsets.lifecycle, slideOffsets.encryption, slideOffsets.x402, slideOffsets.market, slideOffsets.agentStart, hasX402]);

  // Lifecycle step animation
  useEffect(() => {
    if (slide !== slideOffsets.lifecycle) return;
    setLcStep(0);
    const iv = setInterval(() => {
      setLcStep(prev => {
        if (prev >= biteSteps.length - 1) { clearInterval(iv); return prev; }
        playSound('tick');
        return prev + 1;
      });
    }, 500);
    return () => clearInterval(iv);
  }, [slide, biteSteps.length, slideOffsets.lifecycle]);

  // Sound on decrypt
  useEffect(() => {
    if (slide === 0) playSound('reveal');
  }, [slide]);

  // Sparkline
  const spark = useMemo(() => {
    if (priceHistory.length < 2) return null;
    const prices = priceHistory.map(p => p.ethPrice);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const pad = range * 0.1;
    const adjMin = minP - pad;
    const adjRange = range + pad * 2;
    const W = 600, H = 140;
    const pts = prices.map((p, i) => {
      const x = (i / (prices.length - 1)) * W;
      const y = H - ((p - adjMin) / adjRange) * H;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const trendUp = prices[prices.length - 1] >= prices[0];
    const startTs = priceHistory[0].timestamp;
    const endTs = priceHistory[priceHistory.length - 1].timestamp;
    const tsRange = endTs - startTs || 1;
    const markers = tradeMarkers
      .filter(m => m.timestamp >= startTs && m.timestamp <= endTs)
      .map(m => {
        const xPct = (m.timestamp - startTs) / tsRange;
        const x = xPct * W;
        const idx = Math.round(xPct * (prices.length - 1));
        const price = prices[Math.min(idx, prices.length - 1)];
        const y = H - ((price - adjMin) / adjRange) * H;
        return { ...m, x, y };
      });
    return { pathD: pts.join(' '), trendUp, markers, W, H };
  }, [priceHistory, tradeMarkers]);

  // ============================================================
  // SLIDE RENDERERS
  // ============================================================

  // --- SLIDE 0: DECRYPTING ---
  const slideDecrypt = (
    <div className="relative flex flex-col items-center justify-center min-h-[420px]">
      <CipherRain />
      <div className="relative z-10 text-center">
        <div className="font-pixel text-[2.5rem] sm:text-[3rem] text-cyan-400 tracking-wider mb-4 animate-pulse">
          DECRYPTING...
        </div>
        <div className="text-[14px] font-mono text-cyan-400/50 mb-6">
          BITE v2 threshold decryption in progress
        </div>
        <div className="w-12 h-12 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="mt-8 space-y-1">
          <div className="text-[14px] font-mono text-[#444]">{biteOps} BITE operations recorded</div>
          <div className="text-[13px] font-mono text-[#333]">{agents.length} strategies sealed on-chain</div>
        </div>
      </div>
    </div>
  );

  // --- SLIDE 1: BITE LIFECYCLE ---
  const slideLifecycle = (
    <div className="flex flex-col items-center justify-center min-h-[420px] px-4">
      <div className="text-center mb-6">
        <div className="text-[12px] font-mono text-[#444] tracking-[0.3em] mb-2">AUDIT TRAIL</div>
        <div className="font-pixel text-[1.5rem] text-yellow-500 tracking-widest mb-1">BITE LIFECYCLE</div>
        <div className="text-[14px] font-mono text-[#555]">encrypted &rarr; condition &rarr; decrypt &rarr; settle</div>
      </div>
      <div className="w-full max-w-lg space-y-2">
        {biteSteps.map((step, i) => {
          const done = i <= lcStep;
          return (
            <motion.div
              key={step.step}
              initial={{ opacity: 0.15, x: -8 }}
              animate={{ opacity: done ? 1 : 0.15, x: done ? 0 : -8 }}
              transition={{ duration: 0.3 }}
              className={`flex items-center gap-3 px-5 py-2.5 rounded-lg border ${
                done ? 'border-green-500/20 bg-green-500/5' : 'border-[#111]'
              }`}
            >
              <span className={`text-[18px] ${done ? 'text-green-500' : 'text-[#333]'}`}>
                {done ? '\u2713' : '\u25cb'}
              </span>
              <div className="flex-1">
                <span className={`text-[14px] font-mono font-medium ${
                  step.step === 'x402' ? (done ? 'text-emerald-400' : 'text-[#444]') :
                  done ? 'text-yellow-500' : 'text-[#444]'
                }`}>{step.step}</span>
                <span className="text-[13px] font-mono text-[#555] ml-2">{step.label}</span>
              </div>
              {step.count > 0 && <span className="text-[14px] font-mono text-[#666] font-medium">{step.count}</span>}
            </motion.div>
          );
        })}
      </div>
      <div className="mt-5 text-[12px] font-mono text-[#444] text-center leading-relaxed">
        <span className="text-yellow-500/60">Encrypted:</span> agent strategies, trade calldata, position sizes<br />
        <span className="text-yellow-500/60">Trigger:</span> arena timer expiry &rarr; BITE.submitCTX() batch decrypt
      </div>
    </div>
  );

  // --- SLIDE 2: ENCRYPTION AUDIT ---
  const slideEncryption = (
    <div className="flex flex-col min-h-[420px] px-4 py-6">
      <div className="text-center mb-5">
        <div className="text-[12px] font-mono text-[#444] tracking-[0.3em] mb-2">PROOF</div>
        <div className="font-pixel text-[1.3rem] text-yellow-500 tracking-widest mb-1">ENCRYPTION AUDIT LOG</div>
        <div className="text-[13px] font-mono text-[#555]">
          Every action was threshold-encrypted before submission
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[280px] space-y-1.5 scrollbar-thin">
        {encryptionLog.map((entry, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.08, 1.5) }}
            className={`flex items-start gap-3 px-4 py-2 rounded border ${
              entry.action === 'seal'
                ? 'border-yellow-500/10 bg-yellow-500/5'
                : 'border-cyan-400/10 bg-cyan-400/5'
            }`}
          >
            <span className="text-[12px] font-mono text-[#444] flex-shrink-0 mt-0.5 tabular-nums">
              {fmtTime(entry.timestamp)}
            </span>
            <span className="text-[13px] font-mono font-medium flex-shrink-0" style={{ color: entry.agentColor }}>
              {entry.agentName}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-mono text-[#777] truncate">{entry.detail}</div>
              {entry.encryptedHash && (
                <div className="text-[11px] font-mono text-yellow-500/50 mt-0.5">
                  cipher: {shortHash(entry.encryptedHash)}
                </div>
              )}
              {entry.txHash && (
                <div className="text-[11px] font-mono text-cyan-400/50 mt-0.5">
                  tx: {shortHash(entry.txHash)}
                </div>
              )}
            </div>
            <span className={`text-[11px] font-mono flex-shrink-0 ${
              entry.action === 'seal' ? 'text-yellow-500/60' : 'text-cyan-400/60'
            }`}>
              {entry.action === 'seal' ? 'SEALED' : 'ENCRYPTED'}
            </span>
          </motion.div>
        ))}
        {encryptionLog.length === 0 && (
          <div className="text-[13px] font-mono text-[#333] text-center py-8">No encryption events recorded</div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#1a1a1a] flex items-center justify-between">
        <div className="text-[12px] font-mono text-[#555]">
          {encryptionLog.filter(e => e.action === 'seal').length} strategies sealed &middot;{' '}
          {encryptionLog.filter(e => e.action === 'trade').length} trades encrypted
        </div>
        <div className="text-[11px] font-mono text-yellow-500/40">
          BITE v2 on SKALE &middot; threshold encryption
        </div>
      </div>
    </div>
  );

  // --- SLIDE 3: x402 COMMERCE LEDGER ---
  const slideX402 = (
    <div className="flex flex-col min-h-[420px] px-4 py-6">
      <div className="text-center mb-5">
        <div className="text-[12px] font-mono text-[#444] tracking-[0.3em] mb-2">COMMERCE</div>
        <div className="font-pixel text-[1.3rem] text-emerald-400 tracking-widest mb-1">x402 AGENT LEDGER</div>
        <div className="text-[13px] font-mono text-[#555]">
          Autonomous agent-to-agent micropayments via x402 EIP-712
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[260px] space-y-2 scrollbar-thin">
        {x402Log.map((entry, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.12, 1.5) }}
            className="px-4 py-3 rounded border border-emerald-500/10 bg-emerald-500/5"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12px] font-mono text-[#444] tabular-nums">{fmtTime(entry.timestamp)}</span>
              <span className="text-[13px] font-mono font-medium" style={{ color: entry.buyerColor }}>
                {entry.buyerName}
              </span>
              <span className="text-[12px] font-mono text-[#555]">&rarr;</span>
              <span className="text-[12px] font-mono text-emerald-400 font-medium">
                purchased intel from
              </span>
              <span className="text-[13px] font-mono font-medium" style={{ color: entry.sellerColor }}>
                {entry.sellerName}
              </span>
            </div>
            <div className="flex items-center gap-3 ml-[68px]">
              <span className="text-[13px] font-mono text-emerald-400 font-medium">
                ${entry.price.toFixed(2)} USDC
              </span>
              <span className="text-[11px] font-mono text-[#555]">via x402 EIP-712 signed payment</span>
            </div>
            {entry.direction && (
              <div className="ml-[68px] mt-1">
                <span className="text-[12px] font-mono text-[#555]">Intel received: </span>
                <span className={`text-[13px] font-mono font-medium ${
                  entry.direction === 'bullish' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {entry.direction === 'bullish' ? '\u2191' : '\u2193'} {entry.direction}
                  {entry.confidence ? ` (${entry.confidence}% confidence)` : ''}
                </span>
              </div>
            )}
          </motion.div>
        ))}
        {x402Log.length === 0 && (
          <div className="text-[13px] font-mono text-[#333] text-center py-8">No x402 transactions in this round</div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#1a1a1a] flex items-center justify-between">
        <div className="text-[13px] font-mono text-emerald-400">
          {x402Summary.payments} total purchases &middot; ${x402Summary.totalUsd.toFixed(2)} settled
        </div>
        <div className="text-[11px] font-mono text-emerald-400/40">
          x402 &middot; EIP-712 &rarr; USDC on SKALE
        </div>
      </div>
    </div>
  );

  // --- SLIDE: MARKET RECAP ---
  const slideMarket = (() => {
    const prices = priceHistory.map(p => p.ethPrice);
    const high = prices.length > 0 ? Math.max(...prices) : 0;
    const low = prices.length > 0 ? Math.min(...prices) : 0;
    const first = prices[0] || 0;
    const last = prices[prices.length - 1] || 0;
    const change = first > 0 ? ((last - first) / first) * 100 : 0;

    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] px-4">
        <div className="text-center mb-5">
          <div className="text-[12px] font-mono text-[#444] tracking-[0.3em] mb-2">ANALYSIS</div>
          <div className="font-pixel text-[1.5rem] text-[#ededed] tracking-widest mb-1">MARKET RECAP</div>
          <div className="text-[14px] font-mono text-[#555]">{totalTrades} trades across {agents.length} agents</div>
        </div>

        <div className="flex items-center gap-10 mb-6">
          <div className="text-center">
            <div className="text-[11px] font-mono text-[#444] tracking-widest mb-1">HIGH</div>
            <div className="text-[20px] font-mono text-green-400 tabular-nums font-medium">
              ${high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[11px] font-mono text-[#444] tracking-widest mb-1">LOW</div>
            <div className="text-[20px] font-mono text-red-400 tabular-nums font-medium">
              ${low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[11px] font-mono text-[#444] tracking-widest mb-1">CHANGE</div>
            <div className={`text-[20px] font-mono tabular-nums font-medium ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </div>
          </div>
        </div>

        {spark && (
          <div className="w-full max-w-xl">
            <svg width="100%" height="140" viewBox={`0 0 ${spark.W} ${spark.H}`} preserveAspectRatio="none">
              <line x1="0" y1={spark.H * 0.25} x2={spark.W} y2={spark.H * 0.25} stroke="#1a1a1a" strokeWidth="0.5" />
              <line x1="0" y1={spark.H * 0.5} x2={spark.W} y2={spark.H * 0.5} stroke="#1a1a1a" strokeWidth="0.5" />
              <line x1="0" y1={spark.H * 0.75} x2={spark.W} y2={spark.H * 0.75} stroke="#1a1a1a" strokeWidth="0.5" />
              <path d={spark.pathD} fill="none" stroke={spark.trendUp ? '#22c55e' : '#ef4444'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {spark.markers.map((m, i) => (
                <g key={i}>
                  <circle cx={m.x} cy={m.y} r="4" fill={m.agentColor} stroke="#0a0a0a" strokeWidth="1.5" />
                  <text x={m.x} y={m.direction === 'buy' ? m.y - 8 : m.y + 14} textAnchor="middle" fill={m.agentColor} fontSize="10" fontFamily="monospace">
                    {m.direction === 'buy' ? '\u2191' : '\u2193'}
                  </text>
                </g>
              ))}
            </svg>
            <div className="flex items-center gap-4 justify-center mt-3">
              {agents.map(a => (
                <div key={a.agentId} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: a.accentColor }} />
                  <span className="text-[12px] font-mono text-[#555]">{a.agentName}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  })();

  // --- SLIDE: AGENT REVEAL ---
  const slideAgent = (idx: number) => {
    const agent = sorted[idx];
    if (!agent) return null;
    const pnlPct = agent.pnl / 100;
    const risk = getRiskLabel(agent.riskTolerance);
    const isLast = idx === sorted.length - 1;

    // Get this agent's encryption + trade events for audit
    const agentEncryptions = encryptionLog.filter(e => e.agentName === agent.agentName);
    const agentX402Events = x402Log.filter(e => e.buyerName === agent.agentName || e.sellerName === agent.agentName);

    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] px-4">
        <div className="text-center mb-4">
          <div className="text-[12px] font-mono text-[#444] tracking-[0.3em] mb-3">
            AGENT REVEAL {idx + 1} / {sorted.length}
          </div>
          <div className="flex items-center justify-center gap-4 mb-2">
            <div className={`w-14 h-14 rounded-xl overflow-hidden bg-[#111] ring-2 ${isLast ? 'ring-yellow-500/40' : 'ring-[#1a1a1a]'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AVATAR_URL(agent.agentName)} alt={agent.agentName} width={56} height={56} className="w-full h-full" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                {isLast && <span className="text-yellow-500 text-[18px]">{'\u25c6'}</span>}
                <span className="font-pixel text-[1.4rem] tracking-wider" style={{ color: agent.accentColor }}>
                  {agent.agentName}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[12px] font-mono font-medium ${risk.color}`}>{risk.label}</span>
                <span className="text-[12px] font-mono text-[#444]">Rank #{agent.rank}</span>
              </div>
            </div>
          </div>
          {agent.personality && (
            <div className="text-[13px] font-mono text-[#555] italic max-w-md mx-auto">
              &ldquo;{agent.personality}&rdquo;
            </div>
          )}
        </div>

        <div className="w-full max-w-lg space-y-2">
          {/* Reasoning */}
          {agent.reasoning && (
            <div className="px-4 py-2.5 rounded-lg border border-[#1a1a1a] bg-[#0d0d0d]">
              <div className="text-[11px] font-mono text-[#444] tracking-widest mb-1">REASONING</div>
              <div className="text-[13px] font-mono text-[#777] leading-relaxed">{agent.reasoning}</div>
            </div>
          )}

          {/* Trade log with proof */}
          {agentEncryptions.length > 0 && (
            <div className="px-4 py-2.5 rounded-lg border border-[#1a1a1a] bg-[#0d0d0d]">
              <div className="text-[11px] font-mono text-[#444] tracking-widest mb-1">
                ACTIONS ({agentEncryptions.length})
              </div>
              <div className="space-y-1 max-h-[100px] overflow-y-auto">
                {agentEncryptions.slice(-6).map((t, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px] font-mono">
                    <span className="text-[#444] flex-shrink-0 tabular-nums">{fmtTime(t.timestamp)}</span>
                    <span className={t.action === 'trade' ? 'text-cyan-400' : 'text-yellow-500'}>{t.detail}</span>
                    {t.encryptedHash && (
                      <span className="text-[10px] text-yellow-500/40 ml-auto flex-shrink-0">{shortHash(t.encryptedHash)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* x402 activity */}
          {agentX402Events.length > 0 && (
            <div className="px-4 py-2 rounded-lg border border-emerald-500/10 bg-emerald-500/5">
              <div className="text-[11px] font-mono text-emerald-400/60 tracking-widest mb-1">x402 COMMERCE</div>
              {agentX402Events.slice(-3).map((x, i) => (
                <div key={i} className="text-[12px] font-mono text-emerald-400/80 leading-relaxed">
                  {x.buyerName === agent.agentName
                    ? `Purchased intel from ${x.sellerName} ($${x.price.toFixed(2)})`
                    : `Sold intel to ${x.buyerName} ($${x.price.toFixed(2)})`}
                  {x.direction && ` — ${x.direction} ${x.confidence ? `${x.confidence}%` : ''}`}
                </div>
              ))}
            </div>
          )}

          {/* P&L reveal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5, type: 'spring' }}
            className={`text-center py-4 rounded-lg border ${
              isLast ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-[#1a1a1a] bg-[#0d0d0d]'
            }`}
          >
            <span className={`font-pixel text-[2rem] tracking-wider ${pnlPct >= 0 ? 'text-green-500' : 'text-red-400'}`}>
              {agent.pnl >= 0 ? '+' : ''}{agent.pnl} bps
            </span>
            <div className={`text-[13px] font-mono mt-1 ${pnlPct >= 0 ? 'text-green-500/50' : 'text-red-400/50'}`}>
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}% &middot; {agent.tradeCount} trades &middot; {Math.round(agent.exposure)}% deployed
            </div>
          </motion.div>
        </div>
      </div>
    );
  };

  // --- FINAL SLIDE: ON-CHAIN PROOF + LEADERBOARD ---
  const slideProof = (
    <div className="flex flex-col items-center min-h-[420px] px-4 py-6">
      <div className="text-center mb-5">
        <div className="text-[12px] font-mono text-[#444] tracking-[0.3em] mb-2">VERIFIED</div>
        <div className="font-pixel text-[1.5rem] text-[#ededed] tracking-widest mb-1">ON-CHAIN PROOF</div>
        <div className="text-[13px] font-mono text-[#555]">all results settled on SKALE BITE V2</div>
      </div>

      {/* Leaderboard */}
      <div className="w-full max-w-lg space-y-2 mb-5">
        {[...agents].sort((a, b) => b.pnl - a.pnl).map((agent, i) => {
          const pnlPct = agent.pnl / 100;
          return (
            <motion.div
              key={agent.agentId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12 }}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                i === 0 ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-[#1a1a1a] bg-[#0d0d0d]'
              }`}
            >
              <span className={`font-pixel text-[18px] w-8 text-center ${
                i === 0 ? 'text-yellow-500' : i === 1 ? 'text-[#999]' : i === 2 ? 'text-orange-600' : 'text-[#444]'
              }`}>#{i + 1}</span>
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#111] flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={AVATAR_URL(agent.agentName)} alt="" width={32} height={32} className="w-full h-full" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium" style={{ color: agent.accentColor }}>{agent.agentName}</div>
                <div className="text-[11px] font-mono text-[#555]">{agent.tradeCount} trades &middot; {Math.round(agent.exposure)}% deployed</div>
              </div>
              <div className="text-right">
                <span className={`font-pixel text-[16px] tracking-wider ${agent.pnl >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                  {agent.pnl >= 0 ? '+' : ''}{agent.pnl} bps
                </span>
                <div className={`text-[11px] font-mono ${pnlPct >= 0 ? 'text-green-500/50' : 'text-red-400/50'}`}>
                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* On-chain evidence */}
      <div className="w-full max-w-lg rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4 space-y-2">
        <div className="text-[11px] font-mono text-[#444] tracking-widest mb-2">VERIFICATION</div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] font-mono">
          <span className="text-[#555]">Match Code</span>
          <span className="text-[#ededed]">{matchCode}</span>

          {matchOnChainId != null && (
            <>
              <span className="text-[#555]">On-Chain ID</span>
              <span className="text-[#ededed]">#{matchOnChainId}</span>
            </>
          )}

          <span className="text-[#555]">Chain</span>
          <span className="text-cyan-400">BITE V2 Sandbox 2 (SKALE)</span>

          <span className="text-[#555]">Strategies Encrypted</span>
          <span className="text-yellow-500">{encryptionLog.filter(e => e.action === 'seal').length} via BITE.encryptMessage()</span>

          <span className="text-[#555]">Trades Encrypted</span>
          <span className="text-yellow-500">{encryptionLog.filter(e => e.action === 'trade').length} via bite.encryptTransaction()</span>

          <span className="text-[#555]">Total BITE Ops</span>
          <span className="text-yellow-500">{biteOps}</span>

          <span className="text-[#555]">x402 Payments</span>
          <span className="text-emerald-400">{x402Summary.payments} (${x402Summary.totalUsd.toFixed(2)} USDC)</span>

          <span className="text-[#555]">Batch Decrypt</span>
          <span className="text-cyan-400">BITE.submitCTX() &rarr; {agents.length} revealed</span>
        </div>

        <div className="pt-2 mt-2 border-t border-[#1a1a1a] text-[11px] font-mono text-[#444] leading-relaxed space-y-1">
          <div>&bull; All agent strategies were threshold-encrypted before arena entry</div>
          <div>&bull; No agent could observe another&apos;s strategy during trading</div>
          <div>&bull; Decryption triggered only by arena timer expiry condition</div>
          <div>&bull; Results verified and published on-chain via PixieArena.finalizeArena()</div>
        </div>
      </div>

      {onBackToArena && (
        <button
          onClick={onBackToArena}
          className="mt-5 px-8 py-3 text-[14px] font-mono font-medium text-[#ededed] bg-[#1a1a1a] rounded-lg hover:bg-[#222] transition-colors"
        >
          Back to Arena
        </button>
      )}
    </div>
  );

  // ============================================================
  // SLIDE ROUTER
  // ============================================================

  const renderSlide = () => {
    if (slide === slideOffsets.decrypt) return slideDecrypt;
    if (slide === slideOffsets.lifecycle) return slideLifecycle;
    if (slide === slideOffsets.encryption) return slideEncryption;
    if (hasX402 && slide === slideOffsets.x402) return slideX402;
    if (slide === slideOffsets.market) return slideMarket;
    const agentIdx = slide - slideOffsets.agentStart;
    if (agentIdx >= 0 && agentIdx < sorted.length) return slideAgent(agentIdx);
    return slideProof;
  };

  const slideLabel = () => {
    if (slide === slideOffsets.decrypt) return 'THRESHOLD DECRYPTION';
    if (slide === slideOffsets.lifecycle) return 'BITE AUDIT TRAIL';
    if (slide === slideOffsets.encryption) return 'ENCRYPTION PROOF';
    if (hasX402 && slide === slideOffsets.x402) return 'x402 COMMERCE LEDGER';
    if (slide === slideOffsets.market) return 'MARKET ANALYSIS';
    const agentIdx = slide - slideOffsets.agentStart;
    if (agentIdx >= 0 && agentIdx < sorted.length) return `AGENT REVEAL ${agentIdx + 1}/${sorted.length}`;
    return 'ON-CHAIN PROOF';
  };

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={slide}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35 }}
        >
          {renderSlide()}
        </motion.div>
      </AnimatePresence>

      {/* Progress bar + label */}
      <div className="mt-4 px-4">
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === slide ? 'w-5 h-1.5 bg-cyan-400' :
                i < slide ? 'w-1.5 h-1.5 bg-[#444]' :
                'w-1.5 h-1.5 bg-[#1a1a1a]'
              }`}
            />
          ))}
        </div>
        <div className="text-center mt-2 text-[11px] font-mono text-[#444] tracking-widest">
          {slideLabel()}
        </div>
      </div>
    </div>
  );
}
