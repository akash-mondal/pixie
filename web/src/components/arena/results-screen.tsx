'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GAME_MODES, getRiskBadge } from '@/lib/system-agents';
import type { TickEvent } from '@/lib/agent-loop';
import type { PnlSnapshot } from '@/hooks/use-pnl-history';
import {
  AVATAR_URL, ExplorerLink, formatTime, bpsToUsd, bpsToPercent,
  LockIcon, truncateHash, EXPLORER_ADDR, EXPLORER_BASE,
} from './shared';
import { PnlChart } from './pnl-chart';

interface ResultsScreenProps {
  session: any;
  entries: any[];
  lobbyAgents: any[];
  stats: any;
  events: TickEvent[];
  userAgentId: string;
  pnlSnapshots: PnlSnapshot[];
  agentColors: Record<string, string>;
  agentNames: Record<string, string>;
  onExit: () => void;
}

const sectionAnim = (delay: number) => ({
  initial: { opacity: 0, y: 20 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
});

export function ResultsScreen({
  session, entries, lobbyAgents, stats, events,
  userAgentId, pnlSnapshots, agentColors, agentNames, onExit,
}: ResultsScreenProps) {
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  // --- Computed data ---
  const sorted = useMemo(() =>
    [...entries].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0)),
    [entries]
  );

  const winner = sorted[0];
  const winnerLobby = useMemo(() =>
    lobbyAgents.find((la: any) => la.agentId === winner?.agentId),
    [lobbyAgents, winner]
  );

  const realSwapCount = useMemo(() =>
    entries.flatMap((e: any) => e.trades || []).filter((t: any) => t.realSwap).length,
    [entries]
  );

  const identityCount = useMemo(() =>
    lobbyAgents.filter((a: any) => a.identityId > 0).length,
    [lobbyAgents]
  );

  const allX402Events = useMemo(() =>
    entries.flatMap((e: any) =>
      (e.x402Events || []).map((evt: any) => ({ ...evt, buyerName: e.agentName }))
    ),
    [entries]
  );

  const auditTrail = useMemo(() => {
    const trail: { action: string; agent?: string; txHash?: string; timestamp: number; detail?: string }[] = [];
    if (session?.arenaCreationTxHash) {
      trail.push({ action: 'createArena', txHash: session.arenaCreationTxHash, timestamp: session.phaseStartedAt || 0 });
    }
    for (const entry of entries) {
      if (entry.joinTxHash) trail.push({ action: 'joinArena', agent: entry.agentName, txHash: entry.joinTxHash, timestamp: 0 });
    }
    for (const entry of entries) {
      if (entry.trades) {
        for (const trade of entry.trades) {
          if (trade.recordTxHash) trail.push({ action: 'recordTrade', agent: entry.agentName, txHash: trade.recordTxHash, timestamp: trade.timestamp, detail: `${trade.direction?.toUpperCase()} ${trade.pair}` });
          if (trade.swapTxHash) trail.push({ action: trade.realSwap ? 'realSwap' : 'swap', agent: entry.agentName, txHash: trade.swapTxHash, timestamp: trade.timestamp, detail: `${trade.direction?.toUpperCase()} ${trade.pair} [DEX]` });
        }
      }
      // Sealed conviction orders
      if (entry.sealedOrders && Array.isArray(entry.sealedOrders)) {
        for (const order of entry.sealedOrders) {
          if (order.submitTxHash) trail.push({ action: 'sealedOrder', agent: entry.agentName, txHash: order.submitTxHash, timestamp: order.timestamp || 0, detail: `${order.direction?.toUpperCase()} ${order.pair} [CTX]` });
        }
      }
    }
    return trail.sort((a, b) => a.timestamp - b.timestamp);
  }, [session, entries]);

  const auditGroups = useMemo(() => ({
    creation: auditTrail.filter(t => t.action === 'createArena'),
    registration: auditTrail.filter(t => t.action === 'joinArena'),
    trades: auditTrail.filter(t => t.action === 'recordTrade'),
    sealedOrders: auditTrail.filter(t => t.action === 'sealedOrder'),
    swaps: auditTrail.filter(t => t.action === 'realSwap' || t.action === 'swap'),
  }), [auditTrail]);

  const modeConfig = session?.mode ? GAME_MODES[session.mode as keyof typeof GAME_MODES] : null;

  // BITE Encryption Registry — every encryption op across all agents
  const biteRegistry = useMemo(() => {
    const ops: { type: string; agent: string; ciphertext: string; txHash?: string; description: string }[] = [];
    for (const entry of entries) {
      if (entry.encryptedStrategy) {
        ops.push({ type: 'strategy', agent: entry.agentName, ciphertext: entry.encryptedStrategy, txHash: entry.joinTxHash, description: 'Agent strategy (config, risk params, pairs)' });
      }
      for (const trade of (entry.trades || [])) {
        if (trade.encrypted) {
          ops.push({ type: 'swap', agent: entry.agentName, ciphertext: trade.encrypted, txHash: trade.recordTxHash, description: `${trade.direction?.toUpperCase()} ${trade.pair} swap calldata` });
        }
        if (trade.encryptedPnL) {
          ops.push({ type: 'pnl', agent: entry.agentName, ciphertext: trade.encryptedPnL, txHash: trade.recordTxHash, description: `P&L for ${trade.direction?.toUpperCase()} ${trade.pair}` });
        }
        if (trade.encryptedReasoning) {
          ops.push({ type: 'reasoning', agent: entry.agentName, ciphertext: trade.encryptedReasoning, txHash: trade.recordTxHash, description: `Reasoning for ${trade.direction?.toUpperCase()} ${trade.pair}` });
        }
      }
      if (entry.sealedOrders && Array.isArray(entry.sealedOrders)) {
        for (const order of entry.sealedOrders) {
          if (order.encrypted && typeof order.encrypted === 'string') {
            ops.push({ type: 'sealed-order', agent: entry.agentName, ciphertext: order.encrypted, txHash: order.submitTxHash, description: `Sealed ${order.direction?.toUpperCase()} ${order.pair} ($${order.amountIn?.toFixed(2)})` });
          }
        }
      }
    }
    return ops;
  }, [entries]);

  // Find representative tx hashes for tech pillars
  const firstX402Tx = allX402Events.find((e: any) => e.txHash)?.txHash;
  const firstRealSwapTx = useMemo(() => {
    for (const e of entries) {
      for (const t of (e.trades || [])) {
        if (t.realSwap && t.swapTxHash) return t.swapTxHash;
      }
    }
    return undefined;
  }, [entries]);

  // No auto-expand — all cards start collapsed

  // --- Handlers ---
  const handleDownload = () => {
    const data = {
      sessionId: session?.sessionId, mode: session?.mode, duration: session?.duration,
      blockchain: 'BITE V2 Sandbox 2', chainId: 103698795,
      rpcUrl: 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2',
      arenaOnChainId: session?.onChainId, arenaCreationTxHash: session?.arenaCreationTxHash,
      resolvedAt: session?.resolvedAt,
      stats: { biteOps: stats.biteOps, totalTrades: stats.totalTrades, x402Payments: stats.x402Payments, x402TotalUsd: stats.x402TotalUsd },
      agents: sorted.map((entry: any, rank: number) => {
        const lobby = lobbyAgents.find((la: any) => la.agentId === entry.agentId);
        return { rank: rank + 1, name: entry.agentName, pnl: entry.pnl, identityId: lobby?.identityId, walletAddress: lobby?.walletAddress, config: lobby?.config, stopped: entry.stopped, stopReason: entry.stopReason, trades: entry.trades || [], x402: entry.x402Events || [], joinTxHash: entry.joinTxHash };
      }),
      auditTrail,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pixie-session-${session?.sessionId || 'unknown'}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyTxHashes = () => {
    const hashes = auditTrail.filter(t => t.txHash).map(t => `${t.action}: ${t.txHash}`).join('\n');
    navigator.clipboard.writeText(hashes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════
  return (
    <div className="max-w-[1400px] mx-auto px-6 pt-8 pb-24">

      {/* ═══ SECTION 1: HERO / WINNER ═══ */}
      <motion.div {...sectionAnim(0)} className="text-center mb-10">
        <div className="font-pixel text-[14px] text-[#555] tracking-[0.3em] uppercase mb-6">
          SESSION COMPLETE
        </div>

        {winner && winnerLobby && (
          <div className="relative">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(234,179,8,0.04)_0%,_transparent_60%)]" />
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, type: 'spring', stiffness: 100 }}
              className="relative flex flex-col items-center"
            >
              <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-yellow-500/50 shadow-[0_0_40px_rgba(234,179,8,0.15)] mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={AVATAR_URL(winner.agentName)} alt="" width={64} height={64} />
              </div>
              <div className="font-pixel text-[3rem] text-yellow-400 tracking-wider leading-tight mb-2">
                {winner.agentName}
              </div>
              <div className={`font-mono text-[1.5rem] mb-3 ${(winner.pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                wins with {bpsToUsd(winner.pnl ?? 0)} ({bpsToPercent(winner.pnl ?? 0)})
              </div>
              <div className="text-[15px] text-[#888] italic mb-3">
                {winnerLobby.personality}
              </div>
              <div className="flex items-center gap-3 text-[12px] font-mono text-[#666]">
                {winnerLobby.walletAddress && (
                  <a href={`${EXPLORER_ADDR}/${winnerLobby.walletAddress}`} target="_blank" rel="noopener noreferrer"
                    className="text-cyan-400/60 hover:text-cyan-400 transition-colors">
                    {truncateHash(winnerLobby.walletAddress)}
                  </a>
                )}
                <ExplorerLink hash={session?.arenaCreationTxHash} label="arena tx" />
              </div>
            </motion.div>
          </div>
        )}

        {/* Metrics strip */}
        <motion.div {...sectionAnim(0.15)} className="flex gap-3 mt-8">
          {[
            { value: stats.biteOps ?? 0, label: 'encrypted operations', color: 'text-yellow-400', icon: <LockIcon size={18} /> },
            { value: stats.totalTrades ?? 0, label: 'total trades', color: 'text-[#ededed]', icon: <span className="text-[18px]">{'\u2191\u2193'}</span> },
            { value: `${stats.x402Payments ?? 0}`, label: `$${(stats.x402TotalUsd ?? 0).toFixed(2)} intel purchases`, color: 'text-emerald-400', icon: <span className="text-[18px] text-emerald-400">$</span> },
            { value: formatTime((session?.duration ?? 0) * 1000), label: `${modeConfig?.label || 'Arena'} mode`, color: 'text-[#ededed]', icon: <span className="text-[18px]">{'\u25F7'}</span> },
          ].map((m, i) => (
            <div key={i} className="flex-1 rounded-xl border border-[#1a1a1a] bg-[#111] p-5 text-center">
              <div className="mb-1">{m.icon}</div>
              <div className={`font-pixel text-[2rem] ${m.color}`}>{m.value}</div>
              <div className="font-mono text-[13px] text-[#666] tracking-[0.1em] uppercase mt-1">{m.label}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* ═══ SECTION 2: TECHNOLOGY PILLARS ═══ */}
      <motion.div {...sectionAnim(0.25)} className="grid grid-cols-4 gap-3 mb-8">
        {[
          { color: '#eab308', title: 'BITE v2', subtitle: 'Threshold Encryption', stat: `${stats.biteOps ?? 0}`, unit: 'ops', detail: `strategies encrypted at rest${(stats.sealedOrderCount ?? 0) > 0 ? ` + ${stats.sealedOrderCount} sealed orders executed in CTX callback` : ', decrypted on reveal'}`, tx: session?.arenaCreationTxHash },
          { color: '#10b981', title: 'x402', subtitle: 'Agent Commerce', stat: `$${(stats.x402TotalUsd ?? 0).toFixed(2)}`, unit: 'settled', detail: `${stats.x402Payments ?? 0} micropayments via x402 protocol`, tx: firstX402Tx },
          { color: '#06b6d4', title: 'ERC-8004', subtitle: 'On-Chain Identity', stat: `${identityCount}`, unit: 'IDs', detail: 'sovereign agent identities on SKALE', tx: undefined },
          { color: '#8b5cf6', title: 'Algebra DEX', subtitle: 'Real Swaps', stat: `${realSwapCount}`, unit: 'swaps', detail: 'live Algebra Finance AMM on SKALE', tx: firstRealSwapTx },
        ].map((p, i) => (
          <motion.div
            key={p.title}
            {...sectionAnim(0.25 + i * 0.05)}
            className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: p.color }} />
            <div className="font-pixel text-[18px] mb-1" style={{ color: p.color }}>{p.title}</div>
            <div className="font-mono text-[13px] text-[#888] mb-3">{p.subtitle}</div>
            <div className="font-pixel text-[2rem]" style={{ color: p.color }}>
              {p.stat} <span className="text-[14px] text-[#666]">{p.unit}</span>
            </div>
            <div className="font-mono text-[12px] text-[#666] mt-2 leading-relaxed">{p.detail}</div>
            {p.tx && (
              <div className="mt-3">
                <ExplorerLink hash={p.tx} label="view tx" />
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* ═══ SECTION 3: P&L CHART ═══ */}
      <motion.div {...sectionAnim(0.45)} className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden mb-8">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="font-pixel text-[24px] text-[#ededed] tracking-[0.15em]">PERFORMANCE</div>
          <div className="flex items-center gap-4">
            {sorted.map((e: any) => {
              const color = agentColors[e.agentId] || '#888';
              return (
                <div key={e.agentId} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className={`text-[13px] font-mono ${e.agentId === userAgentId ? 'text-cyan-300' : 'text-[#888]'}`}>
                    {e.agentName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="h-[340px] flex flex-col">
          {pnlSnapshots.length >= 2 ? (
            <PnlChart snapshots={pnlSnapshots} agentColors={agentColors} agentNames={agentNames} userAgentId={userAgentId} isReveal={true} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-[14px] font-mono text-[#444]">Chart data unavailable — trading snapshots not captured</div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ═══ SECTION 4: LEADERBOARD (AGENT CARDS) ═══ */}
      <div className="space-y-3 mb-8">
        {sorted.map((entry: any, rank: number) => {
          const isOwned = entry.agentId === userAgentId;
          const pnl = entry.pnl ?? 0;
          const lobby = lobbyAgents.find((la: any) => la.agentId === entry.agentId);
          const isExpanded = expandedAgents.has(entry.agentId);
          const config = lobby?.config;
          const agentX402 = entry.x402Events || [];
          const trades = entry.trades || [];
          const wins = trades.filter((t: any) => t.simulatedPnL > 0).length;
          const total = trades.length;

          return (
            <motion.div
              key={entry.agentId}
              {...sectionAnim(0.55 + rank * 0.04)}
              className={`rounded-xl border overflow-hidden transition-shadow ${
                rank === 0
                  ? 'border-yellow-500/30 shadow-[0_0_30px_rgba(234,179,8,0.06)]'
                  : isOwned
                  ? 'border-cyan-500/30 border-l-[3px]'
                  : 'border-[#1a1a1a] hover:border-[#333]'
              }`}
            >
              {/* Collapsed header */}
              <div
                className="flex items-center justify-between py-5 px-6 cursor-pointer hover:bg-[#0d0d0d] transition-colors"
                onClick={() => setExpandedAgents(prev => {
                  const next = new Set(prev);
                  if (next.has(entry.agentId)) next.delete(entry.agentId);
                  else next.add(entry.agentId);
                  return next;
                })}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-pixel text-[20px] shrink-0 ${
                    rank === 0 ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                    : rank === 1 ? 'bg-[#999]/10 text-[#999] border border-[#666]/30'
                    : rank === 2 ? 'bg-orange-700/10 text-orange-600 border border-orange-700/30'
                    : 'bg-[#111] text-[#666] border border-[#1a1a1a]'
                  }`}>
                    #{rank + 1}
                  </div>
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#111] shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={AVATAR_URL(entry.agentName)} alt="" width={48} height={48} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[20px] font-medium text-[#ededed]">{entry.agentName}</span>
                      {isOwned && <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">YOU</span>}
                      {entry.stopped && <span className="text-[11px] font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded">STOPPED</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {lobby?.archetype && (
                        <span className="text-[14px] font-mono" style={{ color: lobby.accentColor }}>{lobby.archetype}</span>
                      )}
                      {lobby?.identityId > 0 && (
                        <span className="text-[12px] font-mono text-[#666]">ERC-8004 #{lobby.identityId}</span>
                      )}
                      <ExplorerLink hash={entry.joinTxHash} label="join tx" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <span className="text-[14px] font-mono text-[#888]">
                    {entry.tradeCount || 0} trades{(entry.sealedOrderCount || 0) > 0 ? ` + ${entry.sealedOrderCount} sealed` : ''}
                  </span>
                  {total > 0 && (
                    <div className="flex h-3 w-12 rounded overflow-hidden bg-[#111]" title={`${wins}W ${total - wins}L`}>
                      <div className="bg-green-500/60" style={{ width: `${(wins / total) * 100}%` }} />
                      <div className="bg-red-500/40 flex-1" />
                    </div>
                  )}
                  <span className={`font-mono text-[24px] font-semibold tabular-nums ${
                    pnl > 0 ? 'text-green-400' : pnl < 0 ? 'text-red-400' : 'text-[#888]'
                  }`}>
                    {bpsToUsd(pnl)}
                  </span>
                  <span className={`font-mono text-[14px] ${pnl > 0 ? 'text-green-400/60' : pnl < 0 ? 'text-red-400/60' : 'text-[#666]'}`}>
                    {bpsToPercent(pnl)}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none"
                    className={`text-[#555] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              {/* Expanded content */}
              <AnimatePresence>
                {isExpanded && config && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6 space-y-6 border-t border-[#1a1a1a]">

                      {/* 4a: Strategy Reveal (BITE Lifecycle) */}
                      <div className="pt-6">
                        <div className="font-mono text-[13px] text-[#555] tracking-[0.2em] uppercase mb-4">STRATEGY REVEAL — BITE ENCRYPTION LIFECYCLE</div>
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
                          {/* Encrypted */}
                          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.03] p-5">
                            <div className="flex items-center gap-2 mb-3">
                              <LockIcon size={14} />
                              <span className="font-mono text-[12px] text-yellow-500/70 tracking-[0.15em]">ENCRYPTED STRATEGY</span>
                            </div>
                            <div className="text-[12px] font-mono text-yellow-500/30 break-all leading-relaxed">
                              {(entry.encryptedStrategy || '0x' + '0'.repeat(64)).slice(0, 120)}...
                            </div>
                            <div className="text-[11px] font-mono text-yellow-500/40 mt-3">submitted to BITE CTX at arena start</div>
                          </div>
                          {/* Arrow */}
                          <div className="flex flex-col items-center justify-center px-2">
                            <div className="text-[28px] text-[#333]">{'\u2192'}</div>
                            <div className="font-mono text-[11px] text-[#555] tracking-[0.15em] text-center mt-1">BITE CTX<br/>REVEAL</div>
                            {session?.resolvedAt && (
                              <div className="text-[11px] font-mono text-[#444] mt-1">
                                {new Date(session.resolvedAt).toLocaleTimeString()}
                              </div>
                            )}
                          </div>
                          {/* Decrypted */}
                          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-5">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-green-400 text-[14px]">{'\u2713'}</span>
                              <span className="font-mono text-[12px] text-cyan-400/70 tracking-[0.15em]">DECRYPTED STRATEGY</span>
                            </div>
                            <div className="text-[16px] font-medium text-[#ededed] mb-4 leading-relaxed">
                              {lobby?.personality || 'Strategy revealed'}
                            </div>
                            <div className="grid grid-cols-3 gap-3 mb-4">
                              {[
                                { label: 'Risk', value: `${config.riskTolerance}/10`, color: getRiskBadge(config.riskTolerance).color },
                                { label: 'Stop-Loss', value: `${config.stopLoss}%`, color: '#888' },
                                { label: 'Take-Profit', value: `${config.takeProfit}%`, color: '#888' },
                                { label: 'Max Drawdown', value: `${config.maxDrawdown}%`, color: '#888' },
                                { label: 'Position', value: `${config.maxPositionSize}%`, color: '#888' },
                                { label: 'Speed', value: config.executionSpeed, color: '#888' },
                              ].map(p => (
                                <div key={p.label}>
                                  <div className="text-[11px] font-mono text-[#555]">{p.label}</div>
                                  <div className="text-[15px] font-mono" style={{ color: p.color }}>{p.value}</div>
                                </div>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {config.tradingPairs?.map((p: string) => (
                                <span key={p} className="text-[12px] font-mono text-cyan-400/70 bg-cyan-500/10 px-2 py-0.5 rounded">{p}</span>
                              ))}
                              {config.contrarian && (
                                <span className="text-[12px] font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">CONTRARIAN</span>
                              )}
                              {config.signals && typeof config.signals === 'object' && (
                                Object.entries(config.signals).filter(([, v]) => v).map(([k]) => (
                                  <span key={k} className="text-[11px] font-mono text-[#777] bg-[#111] px-2 py-0.5 rounded">{k}</span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 4b: Trade Timeline */}
                      {trades.length > 0 && (
                        <div>
                          <div className="font-mono text-[13px] text-[#555] tracking-[0.2em] uppercase mb-4">
                            TRADE TIMELINE ({trades.length})
                          </div>
                          <div className="max-h-[400px] overflow-y-auto pr-1">
                            <div className="relative pl-6">
                              {/* Timeline line */}
                              <div className="absolute left-[7px] top-2 bottom-2 w-[1px] bg-[#1a1a1a]" />
                              {trades.map((trade: any, i: number) => (
                                <div key={i} className="relative mb-3">
                                  {/* Timeline dot */}
                                  <div className={`absolute left-[-20px] top-4 w-3 h-3 rounded-full border-2 ${
                                    trade.direction === 'buy' ? 'bg-green-400/20 border-green-400' : 'bg-red-400/20 border-red-400'
                                  }`} />
                                  {/* Trade card */}
                                  <div className={`rounded-xl border border-[#1a1a1a] bg-[#111] p-4 ${
                                    trade.realSwap ? 'border-l-2 border-l-violet-500/40' : ''
                                  }`}>
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-3">
                                        <span className={`text-[16px] font-mono font-medium ${
                                          trade.direction === 'buy' ? 'text-green-400' : 'text-red-400'
                                        }`}>
                                          {trade.direction === 'buy' ? '\u2191 BUY' : '\u2193 SELL'}
                                        </span>
                                        <span className="text-[16px] font-mono text-[#ededed]">{trade.pair}</span>
                                      </div>
                                      <span className={`font-mono text-[16px] font-semibold ${
                                        trade.simulatedPnL > 0 ? 'text-green-400' : trade.simulatedPnL < 0 ? 'text-red-400' : 'text-[#888]'
                                      }`}>
                                        {bpsToUsd(trade.simulatedPnL || 0)}
                                      </span>
                                    </div>
                                    {trade.reasoning && (
                                      <div className="text-[13px] font-mono text-[#999] leading-relaxed mb-2">
                                        {trade.reasoning.length > 150 ? trade.reasoning.slice(0, 150) + '...' : trade.reasoning}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-3">
                                      <span className="text-[12px] font-mono text-[#555]">{new Date(trade.timestamp).toLocaleTimeString()}</span>
                                      <ExplorerLink hash={trade.recordTxHash} label="record" />
                                      <ExplorerLink hash={trade.swapTxHash} label="swap" />
                                      {trade.realSwap && <span className="text-[11px] font-mono text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">REAL DEX</span>}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 4b.5: Sealed Conviction Orders */}
                      {entry.sealedOrders && entry.sealedOrders.length > 0 && typeof entry.sealedOrders[0]?.pair === 'string' && (
                        <div>
                          <div className="font-mono text-[13px] text-[#555] tracking-[0.2em] uppercase mb-4">
                            SEALED CONVICTION ORDERS ({entry.sealedOrders.length})
                          </div>
                          <div className="space-y-3">
                            {entry.sealedOrders.map((order: any, i: number) => (
                              <div key={i} className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.02] p-5">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    <span className="text-[11px] font-mono text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded">CTX EXECUTED</span>
                                    <span className={`text-[16px] font-mono font-medium ${
                                      order.direction === 'buy' ? 'text-green-400' : 'text-red-400'
                                    }`}>
                                      {order.direction === 'buy' ? '\u2191 BUY' : '\u2193 SELL'}
                                    </span>
                                    <span className="text-[16px] font-mono text-[#ededed]">{order.pair}</span>
                                  </div>
                                  <span className="text-[14px] font-mono text-yellow-400">${order.amountIn?.toFixed(2)}</span>
                                </div>

                                {/* Encrypted → Decrypted flow */}
                                <div className="mb-3">
                                  <div className="text-[11px] font-mono text-yellow-500/50 mb-1">Encrypted at submission:</div>
                                  <div className="text-[11px] font-mono text-yellow-500/30 break-all leading-relaxed">
                                    {order.encrypted || ''}
                                  </div>
                                  <div className="text-[20px] text-[#333] text-center my-1">{'\u2193'}</div>
                                  <div className="text-[11px] font-mono text-cyan-400/50 mb-1">Decrypted & executed in onDecrypt():</div>
                                  <div className="text-[13px] font-mono text-[#ccc]">
                                    {order.direction === 'buy' ? `${order.amountIn?.toFixed(2)} USDC \u2192 ${order.pair?.split('/')[0]}` : `${order.pair?.split('/')[0]} \u2192 USDC`}
                                  </div>
                                </div>

                                {order.reasoning && (
                                  <div className="text-[13px] font-mono text-[#999] leading-relaxed mb-2 italic">
                                    &ldquo;{order.reasoning.length > 150 ? order.reasoning.slice(0, 150) + '...' : order.reasoning}&rdquo;
                                  </div>
                                )}

                                <div className="flex flex-col gap-2">
                                  {order.submitTxHash && (
                                    <div className="text-[11px] font-mono text-[#666] break-all">
                                      tx: {order.submitTxHash}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-3">
                                    <ExplorerLink hash={order.submitTxHash} label="view on explorer" />
                                    <span className="text-[11px] font-mono text-yellow-500/40">executed inside CTX callback</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 4c: x402 Intel Ledger */}
                      {agentX402.length > 0 && (
                        <div>
                          <div className="font-mono text-[13px] text-[#555] tracking-[0.2em] uppercase mb-4">x402 INTEL PURCHASES</div>
                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] p-5 space-y-2.5">
                            {agentX402.map((evt: any, i: number) => (
                              <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-mono text-emerald-400/60 bg-emerald-500/10 px-1.5 py-0.5 rounded">x402</span>
                                  <span className="text-[13px] font-mono text-[#ccc]">
                                    {evt.targetAgentName ? `Intel from ${evt.targetAgentName}` : (evt.message?.slice(0, 60) || 'Intel purchase')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  {evt.direction && (
                                    <span className={`text-[13px] font-mono ${
                                      evt.direction === 'bullish' ? 'text-green-400' : evt.direction === 'bearish' ? 'text-red-400' : 'text-[#888]'
                                    }`}>
                                      {evt.direction} {evt.confidence ? `${evt.confidence}%` : ''}
                                    </span>
                                  )}
                                  {evt.settled && <span className="text-[12px] font-mono text-emerald-400">$0.01</span>}
                                  <ExplorerLink hash={evt.txHash} label="settlement" />
                                </div>
                              </div>
                            ))}
                            <div className="text-[12px] font-mono text-emerald-400/50 pt-2 border-t border-emerald-500/10">
                              {agentX402.filter((e: any) => e.settled).length} purchases, ${(agentX402.filter((e: any) => e.settled).length * 0.01).toFixed(2)} USDC spent
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 4d: On-Chain Footprint */}
                      <div>
                        <div className="font-mono text-[13px] text-[#555] tracking-[0.2em] uppercase mb-4">ON-CHAIN FOOTPRINT</div>
                        <div className="flex flex-wrap gap-2">
                          {lobby?.walletAddress && (
                            <a href={`${EXPLORER_ADDR}/${lobby.walletAddress}`} target="_blank" rel="noopener noreferrer"
                              className="text-[12px] font-mono text-cyan-400/60 hover:text-cyan-400 bg-[#111] px-2.5 py-1.5 rounded-lg border border-[#1a1a1a] hover:border-[#333] transition-colors">
                              wallet {truncateHash(lobby.walletAddress)}
                            </a>
                          )}
                          {lobby?.identityId > 0 && (
                            <span className="text-[12px] font-mono text-[#888] bg-[#111] px-2.5 py-1.5 rounded-lg border border-[#1a1a1a]">
                              ERC-8004 #{lobby.identityId}
                            </span>
                          )}
                          {entry.joinTxHash && (
                            <a href={`${EXPLORER_BASE}/${entry.joinTxHash}`} target="_blank" rel="noopener noreferrer"
                              className="text-[12px] font-mono text-cyan-400/60 hover:text-cyan-400 bg-[#111] px-2.5 py-1.5 rounded-lg border border-[#1a1a1a] hover:border-[#333] transition-colors">
                              joinArena
                            </a>
                          )}
                          {trades.filter((t: any) => t.recordTxHash || t.swapTxHash).map((t: any, i: number) => (
                            <span key={i} className="flex gap-1">
                              {t.recordTxHash && (
                                <a href={`${EXPLORER_BASE}/${t.recordTxHash}`} target="_blank" rel="noopener noreferrer"
                                  className="text-[12px] font-mono text-cyan-400/60 hover:text-cyan-400 bg-[#111] px-2.5 py-1.5 rounded-lg border border-[#1a1a1a] hover:border-[#333] transition-colors">
                                  record #{i + 1}
                                </a>
                              )}
                              {t.swapTxHash && (
                                <a href={`${EXPLORER_BASE}/${t.swapTxHash}`} target="_blank" rel="noopener noreferrer"
                                  className={`text-[12px] font-mono bg-[#111] px-2.5 py-1.5 rounded-lg border border-[#1a1a1a] hover:border-[#333] transition-colors ${
                                    t.realSwap ? 'text-violet-400/60 hover:text-violet-400' : 'text-cyan-400/60 hover:text-cyan-400'
                                  }`}>
                                  swap #{i + 1} {t.realSwap ? '[DEX]' : ''}
                                </a>
                              )}
                            </span>
                          ))}
                          {agentX402.filter((e: any) => e.txHash).map((e: any, i: number) => (
                            <a key={`x402-${i}`} href={`${EXPLORER_BASE}/${e.txHash}`} target="_blank" rel="noopener noreferrer"
                              className="text-[12px] font-mono text-emerald-400/60 hover:text-emerald-400 bg-[#111] px-2.5 py-1.5 rounded-lg border border-[#1a1a1a] hover:border-[#333] transition-colors">
                              x402 #{i + 1}
                            </a>
                          ))}
                        </div>
                      </div>

                      {/* Stop reason */}
                      {entry.stopped && entry.stopReason && (
                        <div className="text-[14px] font-mono text-red-400 bg-red-500/[0.05] border border-red-500/20 rounded-xl px-4 py-3">
                          Stopped: {entry.stopReason}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* ═══ SECTION 5: x402 COMMERCE NETWORK ═══ */}
      {(stats.x402Payments > 0 || allX402Events.length > 0) && (
        <motion.div {...sectionAnim(0.7)} className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.02] p-6 mb-8">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="font-pixel text-[24px] text-emerald-400 tracking-[0.1em] mb-4">x402 AGENT COMMERCE</div>
              <div className="font-pixel text-[3rem] text-emerald-400 mb-2">
                ${(stats.x402TotalUsd ?? 0).toFixed(2)}
              </div>
              <div className="text-[16px] font-mono text-[#888] mb-6">
                {stats.x402Payments ?? 0} autonomous micropayments settled
              </div>
              <div className="space-y-2.5 text-[13px] font-mono text-[#666]">
                {[
                  'Agent requests rival\'s market analysis',
                  'Server returns HTTP 402 Payment Required',
                  'Agent signs EIP-712 USDC permit ($0.01)',
                  'RelAI Facilitator settles on SKALE (zero gas)',
                  'Intel delivered — encrypted under BITE',
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-emerald-400/60">{i + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-mono text-[13px] text-[#555] tracking-[0.2em] uppercase mb-3">TRANSACTION LEDGER</div>
              <div className="max-h-[260px] overflow-y-auto space-y-2">
                {allX402Events.length > 0 ? allX402Events.map((evt: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-[13px] font-mono">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[#ccc] truncate">{evt.buyerName}</span>
                      <span className="text-[#555]">{'\u2192'}</span>
                      <span className="text-emerald-400/70 truncate">{evt.targetAgentName || 'agent'}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-emerald-400">$0.01</span>
                      {evt.settled && <span className="text-[11px] text-emerald-400/60 bg-emerald-500/10 px-1.5 py-0.5 rounded">SETTLED</span>}
                      <ExplorerLink hash={evt.txHash} label="tx" />
                    </div>
                  </div>
                )) : (
                  <div className="text-[13px] font-mono text-[#555] py-4">
                    {stats.x402Payments} payments settled during trading session.
                    Individual events streamed in real-time.
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ SECTION 5.5: BITE ENCRYPTION REGISTRY ═══ */}
      {biteRegistry.length > 0 && (
        <motion.div {...sectionAnim(0.75)} className="rounded-xl border border-yellow-500/15 bg-yellow-500/[0.02] p-6 mb-8">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <LockIcon size={20} />
              <div className="font-pixel text-[24px] text-yellow-400 tracking-[0.1em]">BITE ENCRYPTION REGISTRY</div>
            </div>
            <span className="text-[13px] font-mono text-yellow-500/50">{biteRegistry.length} operations</span>
          </div>
          <div className="text-[12px] font-mono text-[#666] mb-5">
            Every BITE threshold encryption operation — full ciphertexts with block explorer links
          </div>
          <div className="max-h-[600px] overflow-y-auto space-y-3 pr-1">
            {biteRegistry.map((op, i) => {
              const badgeMap: Record<string, string> = {
                strategy: 'text-yellow-400 bg-yellow-500/10',
                swap: 'text-cyan-400 bg-cyan-500/10',
                pnl: 'text-green-400 bg-green-500/10',
                reasoning: 'text-violet-400 bg-violet-500/10',
                'sealed-order': 'text-yellow-400 bg-yellow-500/10',
              };
              return (
                <div key={i} className={`rounded-lg border p-4 ${
                  op.type === 'sealed-order'
                    ? 'border-yellow-500/20 bg-yellow-500/[0.03]'
                    : 'border-[#1a1a1a] bg-[#0a0a0a]'
                }`}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded uppercase ${badgeMap[op.type] || 'text-[#888] bg-[#111]'}`}>
                      {op.type === 'sealed-order' ? '\u25C6 sealed order' : op.type}
                    </span>
                    <span className="text-[13px] font-mono text-[#ccc]">{op.agent}</span>
                    <span className="text-[12px] font-mono text-[#666]">{op.description}</span>
                  </div>
                  <div className="mb-2">
                    <div className="text-[10px] font-mono text-[#555] mb-1">Ciphertext:</div>
                    <div className="text-[11px] font-mono text-yellow-500/30 break-all leading-relaxed">
                      {op.ciphertext}
                    </div>
                  </div>
                  {op.txHash && (
                    <div className="flex items-start gap-3">
                      <ExplorerLink hash={op.txHash} label="view on explorer" />
                      <span className="text-[11px] font-mono text-[#555] break-all">
                        {op.txHash}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ═══ SECTION 6: ON-CHAIN AUDIT TRAIL (GROUPED) ═══ */}
      <motion.div {...sectionAnim(0.8)} className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="font-pixel text-[24px] text-[#ededed] tracking-[0.15em]">ON-CHAIN AUDIT TRAIL</div>
          <span className="text-[13px] font-mono text-[#666]">{auditTrail.length} transactions</span>
        </div>

        {auditTrail.length > 0 ? (
          <div className="max-h-[320px] overflow-y-auto space-y-4">
            {/* Group: Arena Creation */}
            {auditGroups.creation.length > 0 && (
              <div>
                <div className="text-[12px] font-mono text-[#555] tracking-[0.2em] uppercase pb-2 border-b border-[#1a1a1a] mb-2">Arena Creation</div>
                {auditGroups.creation.map((item, i) => (
                  <AuditRow key={i} item={item} badgeClass="text-yellow-400 bg-yellow-500/10" />
                ))}
              </div>
            )}
            {/* Group: Registration */}
            {auditGroups.registration.length > 0 && (
              <div>
                <div className="text-[12px] font-mono text-[#555] tracking-[0.2em] uppercase pb-2 border-b border-[#1a1a1a] mb-2">Agent Registration</div>
                {auditGroups.registration.map((item, i) => (
                  <AuditRow key={i} item={item} badgeClass="text-cyan-400 bg-cyan-500/10" />
                ))}
              </div>
            )}
            {/* Group: Trade Records */}
            {auditGroups.trades.length > 0 && (
              <div>
                <div className="text-[12px] font-mono text-[#555] tracking-[0.2em] uppercase pb-2 border-b border-[#1a1a1a] mb-2">Trade Records</div>
                {auditGroups.trades.map((item, i) => (
                  <AuditRow key={i} item={item} badgeClass="text-[#888] bg-[#111]" />
                ))}
              </div>
            )}
            {/* Group: CTX Sealed Orders */}
            {auditGroups.sealedOrders.length > 0 && (
              <div>
                <div className="text-[12px] font-mono text-[#555] tracking-[0.2em] uppercase pb-2 border-b border-[#1a1a1a] mb-2">CTX Executed Swaps</div>
                {auditGroups.sealedOrders.map((item, i) => (
                  <AuditRow key={i} item={item} badgeClass="text-yellow-400 bg-yellow-500/10" />
                ))}
              </div>
            )}
            {/* Group: DEX Swaps */}
            {auditGroups.swaps.length > 0 && (
              <div>
                <div className="text-[12px] font-mono text-[#555] tracking-[0.2em] uppercase pb-2 border-b border-[#1a1a1a] mb-2">DEX Swaps</div>
                {auditGroups.swaps.map((item, i) => (
                  <AuditRow key={i} item={item} badgeClass="text-violet-400 bg-violet-500/10" />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-[14px] font-mono text-[#555]">No on-chain transactions recorded</div>
        )}

        <div className="text-[12px] font-mono text-[#555] mt-4 pt-3 border-t border-[#1a1a1a]">
          {session?.resolvedAt && (
            <span>BITE CTX reveal at {new Date(session.resolvedAt).toLocaleTimeString()} — {stats.biteOps} BITE ops · </span>
          )}
          All transactions on BITE V2 Sandbox 2 (Chain ID: 103698795)
        </div>
      </motion.div>

      {/* ═══ SECTION 7: ACTION BAR ═══ */}
      <motion.div {...sectionAnim(0.9)} className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-[13px] font-mono text-[#666]">
            <span>{session?.sessionId ? truncateHash(session.sessionId, 10, 6) : ''}</span>
            <span className="text-yellow-500/50 bg-yellow-500/[0.06] px-2 py-0.5 rounded border border-yellow-500/15">BITE V2 Sandbox 2</span>
            {session?.onChainId != null && <span>Arena #{session.onChainId}</span>}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleDownload}
              className="px-6 py-3 rounded-lg border border-[#333] text-[14px] font-mono text-[#ededed] hover:bg-[#111] transition-colors">
              Download JSON
            </button>
            <button onClick={handleCopyTxHashes}
              className="px-6 py-3 rounded-lg border border-[#333] text-[14px] font-mono text-[#ededed] hover:bg-[#111] transition-colors">
              {copied ? 'Copied!' : 'Copy TX Hashes'}
            </button>
            <button onClick={onExit}
              className="px-10 py-3 rounded-lg bg-[#ededed] text-[#0a0a0a] text-[15px] font-semibold hover:bg-white transition-colors">
              Go Home
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Audit Trail Row Component ──
function AuditRow({ item, badgeClass }: { item: { action: string; agent?: string; txHash?: string; detail?: string }; badgeClass: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2.5">
        <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${badgeClass}`}>{item.action}</span>
        {item.agent && <span className="text-[13px] font-mono text-[#ccc]">{item.agent}</span>}
        {item.detail && <span className="text-[13px] font-mono text-[#666]">{item.detail}</span>}
      </div>
      <ExplorerLink hash={item.txHash} />
    </div>
  );
}
