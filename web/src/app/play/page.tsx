'use client';

export const dynamic = 'force-dynamic';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { AuthGuard } from '@/components/shared/auth-guard';
import { useAgents } from '@/hooks/use-agents';
import { useCreateSession } from '@/hooks/use-session';
import { useWallet } from '@/hooks/use-wallet';
import { useFundAgent } from '@/hooks/use-fund-agent';
import { GAME_MODES, type GameMode } from '@/lib/system-agents';
import { playSound } from '@/lib/sounds';

const MODES: GameMode[] = ['sprint', 'standard', 'extended', 'degen', 'whale'];

const MODE_UI: Record<GameMode, {
  color: string;
  accent: string;
  border: string;
  glow: string;
  bg: string;
}> = {
  sprint:   { color: 'text-red-400',     accent: 'bg-red-400',     border: 'border-red-500/30',     glow: 'hover:shadow-[0_0_60px_rgba(248,113,113,0.12)]', bg: 'bg-red-500/[0.03]' },
  standard: { color: 'text-cyan-400',    accent: 'bg-cyan-400',    border: 'border-cyan-500/30',    glow: 'hover:shadow-[0_0_60px_rgba(34,211,238,0.12)]',  bg: 'bg-cyan-500/[0.03]' },
  extended: { color: 'text-violet-400',  accent: 'bg-violet-400',  border: 'border-violet-500/30',  glow: 'hover:shadow-[0_0_60px_rgba(167,139,250,0.12)]', bg: 'bg-violet-500/[0.03]' },
  degen:    { color: 'text-orange-400',  accent: 'bg-orange-400',  border: 'border-orange-500/30',  glow: 'hover:shadow-[0_0_60px_rgba(251,146,60,0.12)]',  bg: 'bg-orange-500/[0.03]' },
  whale:    { color: 'text-emerald-400', accent: 'bg-emerald-400', border: 'border-emerald-500/30', glow: 'hover:shadow-[0_0_60px_rgba(52,211,153,0.12)]',  bg: 'bg-emerald-500/[0.03]' },
};

const AVATAR_URL = (name: string) =>
  `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(name)}&size=56&backgroundColor=0a0a0a`;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return m >= 1 ? `${m}m` : `${seconds}s`;
}

// ── Agent Card with balance, fund/withdraw, portfolio link ──

function AgentCard({
  agent,
  isSelected,
  onSelect,
  index,
}: {
  agent: any;
  isSelected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const { address: userAddress } = useWallet();
  const queryClient = useQueryClient();
  const fundAgent = useFundAgent();
  const [fundAmt, setFundAmt] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: balanceData } = useQuery<{ balance: string; formatted: string }>({
    queryKey: ['agent-balance', agent.id],
    queryFn: async () => {
      const res = await fetch(`/api/agent/${agent.id}/balance`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    refetchInterval: 15000,
  });

  const refreshBalance = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['agent-balance', agent.id] });
    queryClient.invalidateQueries({ queryKey: ['agents'] });
  }, [queryClient, agent.id]);

  const handleFund = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const amt = parseFloat(fundAmt);
    if (!amt || amt <= 0) return;
    setMsg(null);
    try {
      await fundAgent.fund(agent.id, agent.walletAddress, amt);
      setMsg({ type: 'success', text: `+$${amt} funded` });
      setFundAmt('');
      refreshBalance();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message?.slice(0, 40) });
    }
  };

  const handleWithdraw = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const amt = parseFloat(withdrawAmt);
    if (!amt || amt <= 0 || !userAddress) return;
    setWithdrawing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/agent/${agent.id}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, toAddress: userAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ type: 'success', text: `-$${amt} withdrawn` });
      setWithdrawAmt('');
      refreshBalance();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message?.slice(0, 40) });
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onSelect}
      className={`relative rounded-xl border p-5 text-left transition-all cursor-pointer ${
        isSelected
          ? 'border-cyan-500/40 bg-cyan-500/[0.04] shadow-[0_0_40px_rgba(34,211,238,0.06)]'
          : 'border-[#1a1a1a] hover:border-[#333]'
      }`}
    >
      {isSelected && (
        <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-cyan-400 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3.5 mb-3">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#111] border border-[#1a1a1a]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AVATAR_URL(agent.name)} alt="" width={48} height={48} />
        </div>
        <div>
          <div className="text-[16px] text-[#ededed] font-medium">{agent.name}</div>
          <div className="text-[13px] font-mono text-[#666]">
            risk {agent.config?.riskTolerance}/10 &middot; {agent.arenaCount || 0} matches
          </div>
        </div>
      </div>

      {/* Personality */}
      {agent.personality && (
        <p className="text-[13px] text-[#888] font-mono line-clamp-2 leading-relaxed mb-3">
          {agent.personality}
        </p>
      )}

      {/* Status + Balance */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-[12px] font-mono text-green-400/80">FUNDED</span>
          <span className="text-[12px] font-mono text-[#555]">
            {agent.walletAddress?.slice(0, 6)}...{agent.walletAddress?.slice(-4)}
          </span>
        </div>
        <span className="text-[14px] font-mono text-[#ededed] font-medium">
          {balanceData?.formatted ?? '...'}
        </span>
      </div>

      {/* Fund / Withdraw row */}
      <div className="flex items-center gap-2 mb-3" onClick={e => e.stopPropagation()}>
        <input
          type="number"
          step="0.1"
          min="0"
          placeholder="$"
          value={fundAmt}
          onChange={e => setFundAmt(e.target.value)}
          className="w-16 h-7 bg-[#111] border border-[#1a1a1a] rounded px-2 text-[12px] font-mono text-[#ededed] placeholder-[#444] outline-none focus:border-[#333]"
        />
        <button
          onClick={handleFund}
          disabled={fundAgent.isPending || !fundAmt}
          className="h-7 px-3 bg-green-500/15 text-green-400 text-[11px] font-mono rounded border border-green-500/20 hover:bg-green-500/25 disabled:opacity-30 transition-colors"
        >
          {fundAgent.isPending ? '...' : 'fund'}
        </button>
        <div className="w-px h-5 bg-[#1a1a1a]" />
        <input
          type="number"
          step="0.1"
          min="0"
          placeholder="$"
          value={withdrawAmt}
          onChange={e => setWithdrawAmt(e.target.value)}
          className="w-16 h-7 bg-[#111] border border-[#1a1a1a] rounded px-2 text-[12px] font-mono text-[#ededed] placeholder-[#444] outline-none focus:border-[#333]"
        />
        <button
          onClick={handleWithdraw}
          disabled={withdrawing || !withdrawAmt}
          className="h-7 px-3 bg-red-500/15 text-red-400 text-[11px] font-mono rounded border border-red-500/20 hover:bg-red-500/25 disabled:opacity-30 transition-colors"
        >
          {withdrawing ? '...' : 'withdraw'}
        </button>
      </div>

      {/* Status message */}
      {msg && (
        <div className={`text-[10px] font-mono mb-2 ${msg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {/* Select + Portfolio buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className={`flex-1 h-8 rounded text-[12px] font-mono font-medium transition-colors ${
            isSelected
              ? 'bg-cyan-400 text-[#0a0a0a] hover:bg-cyan-300'
              : 'bg-[#1a1a1a] text-[#ededed] hover:bg-[#222]'
          }`}
        >
          {isSelected ? 'selected' : 'select'}
        </button>
        <Link
          href={`/agents/${agent.id}`}
          onClick={e => e.stopPropagation()}
          className="flex items-center justify-center gap-1.5 flex-1 h-8 rounded border border-[#1a1a1a] bg-[#0d0d0d] text-[12px] font-mono text-[#888] hover:text-[#ededed] hover:border-[#333] transition-colors"
        >
          portfolio &rarr;
        </Link>
      </div>
    </motion.div>
  );
}

// ── Main Page ──

export default function PlayPage() {
  const router = useRouter();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const createSession = useCreateSession();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [creating, setCreating] = useState(false);

  const fundedAgents = (agents || []).filter((a: any) => a.funded && a.walletAddress);
  const hasAgents = fundedAgents.length > 0;

  const handleStart = async () => {
    if (!selectedAgent || !selectedMode) return;
    setCreating(true);
    try {
      const result = await createSession.mutateAsync({
        mode: selectedMode,
        agentId: selectedAgent,
      });
      playSound('join');
      router.push(`/play/${result.sessionId}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      setCreating(false);
    }
  };

  return (
    <AuthGuard>
    <div className="min-h-screen bg-[#0a0a0a]">
      <Header />
      <main className="max-w-[1400px] mx-auto px-8 pt-24 pb-20">

        {/* Hero */}
        <div className="mb-12">
          <h1 className="font-pixel text-[2.8rem] text-[#ededed] tracking-wider leading-tight">AI TRADING ARENA</h1>
          <p className="text-[17px] text-[#888] font-mono mt-3 max-w-[600px] leading-relaxed">
            Pick your agent. Choose a mode. Trade against AI opponents with encrypted strategies.
          </p>
        </div>

        {/* How it works strip */}
        <div className="flex items-stretch gap-px bg-[#1a1a1a] rounded-xl overflow-hidden mb-12">
          {[
            { num: '01', title: 'Lobby', desc: 'Opponents generated, wallets funded, strategies encrypted' },
            { num: '02', title: 'Trading', desc: 'AI agents trade autonomously. Your view is uncensored, rivals encrypted.' },
            { num: '03', title: 'Reveal', desc: 'Timer expires, all strategies BITE-decrypted, winner crowned' },
          ].map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              className="flex-1 bg-[#0a0a0a] px-6 py-5"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[13px] font-mono text-[#444]">{step.num}</span>
                <span className="text-[17px] text-[#ededed] font-medium">{step.title}</span>
              </div>
              <p className="text-[14px] text-[#666] font-mono leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Gate: No agents */}
        {!agentsLoading && !hasAgents && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-[#1a1a1a] p-10 text-center mb-12"
          >
            <div className="text-[20px] text-[#ededed] font-medium mb-3">No agents ready</div>
            <p className="text-[15px] text-[#777] font-mono mb-6 max-w-md mx-auto leading-relaxed">
              Create and register an agent on-chain before entering the arena. Each agent needs an ERC-8004 identity, wallet, and funds.
            </p>
            <Link
              href="/agents"
              className="inline-block px-8 py-3 bg-[#ededed] text-[#0a0a0a] text-[15px] font-semibold rounded-lg hover:bg-white transition-colors"
            >
              Create Agent &rarr;
            </Link>
          </motion.div>
        )}

        {/* Step 1: Select Agent */}
        {hasAgents && (
          <>
            <div className="mb-10">
              <div className="text-[13px] text-[#555] font-mono tracking-[0.25em] uppercase mb-5">
                1. Select your agent
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {fundedAgents.map((agent: any, i: number) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedAgent === agent.id}
                    onSelect={() => {
                      setSelectedAgent(selectedAgent === agent.id ? null : agent.id);
                      playSound('tick');
                    }}
                    index={i}
                  />
                ))}

                {/* Add new agent card */}
                <Link
                  href="/agents"
                  className="rounded-xl border border-dashed border-[#333] p-5 flex flex-col items-center justify-center text-center hover:border-[#555] transition-colors min-h-[140px]"
                >
                  <div className="text-[24px] text-[#555] mb-2">+</div>
                  <div className="text-[14px] text-[#666] font-mono">Create new agent</div>
                </Link>
              </div>
            </div>

            {/* Step 2: Select Mode */}
            <div className="mb-10">
              <div className="text-[13px] text-[#555] font-mono tracking-[0.25em] uppercase mb-5">
                2. Choose game mode
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {MODES.map((mode, i) => {
                  const cfg = GAME_MODES[mode];
                  const ui = MODE_UI[mode];
                  const isSelected = selectedMode === mode;

                  return (
                    <motion.button
                      key={mode}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.04 }}
                      onClick={() => {
                        setSelectedMode(isSelected ? null : mode);
                        playSound('tick');
                      }}
                      className={`group relative rounded-xl border p-6 text-left transition-all ${
                        isSelected
                          ? `${ui.border} ${ui.bg} shadow-[0_0_40px_rgba(255,255,255,0.03)]`
                          : `border-[#1a1a1a] hover:border-[#333] ${ui.glow}`
                      }`}
                    >
                      {isSelected && (
                        <div className={`absolute top-4 right-4 w-3 h-3 rounded-full ${ui.accent}`} />
                      )}
                      <div className="flex items-start justify-between mb-3">
                        <div className={`font-pixel text-[22px] ${ui.color} tracking-wider`}>
                          {cfg.label}
                        </div>
                        <span className={`text-[14px] font-mono ${ui.color} opacity-60`}>
                          {formatDuration(cfg.tradingDuration)}
                        </span>
                      </div>
                      <div className="text-[14px] font-mono text-[#666] mb-2">
                        {cfg.pairs.join(', ')}
                      </div>
                      <div className="text-[14px] font-mono text-[#777] mb-4">{cfg.vibe}</div>
                      <div className="flex items-center justify-between text-[13px] font-mono text-[#555]">
                        <span>{cfg.maxOpponents} opponents</span>
                        <span>tick: {cfg.tickInterval / 1000}s</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Start */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-center justify-between rounded-xl border border-[#1a1a1a] p-6"
            >
              <div>
                <div className="text-[13px] text-[#555] font-mono tracking-[0.25em] uppercase mb-1.5">
                  3. Start match
                </div>
                <div className="text-[15px] text-[#888] font-mono">
                  {selectedAgent && selectedMode
                    ? `${fundedAgents.find((a: any) => a.id === selectedAgent)?.name} in ${GAME_MODES[selectedMode].label} mode`
                    : 'Select agent and mode above'}
                </div>
              </div>
              <button
                onClick={handleStart}
                disabled={!selectedAgent || !selectedMode || creating}
                className="px-10 py-3.5 bg-[#ededed] text-[#0a0a0a] text-[16px] font-semibold rounded-lg hover:bg-white disabled:opacity-20 transition-colors"
              >
                {creating ? (
                  <span className="animate-pulse">creating session...</span>
                ) : (
                  'Start Match'
                )}
              </button>
            </motion.div>

          </>
        )}

      </main>
    </div>
    </AuthGuard>
  );
}
