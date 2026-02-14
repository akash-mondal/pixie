'use client';

export const dynamic = 'force-dynamic';

import { use, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { AuthGuard } from '@/components/shared/auth-guard';
import { useWallet } from '@/hooks/use-wallet';
import { useFundAgent } from '@/hooks/use-fund-agent';
import type { StoredAgent } from '@/lib/agent-store';

const AVATAR_URL = (name: string) =>
  `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(name)}&size=96&backgroundColor=0a0a0a`;

const RISK_LABELS: Record<number, string> = {
  1: 'ultra safe', 2: 'conservative', 3: 'conservative',
  4: 'moderate', 5: 'moderate', 6: 'moderate',
  7: 'aggressive', 8: 'aggressive',
  9: 'degen', 10: 'full degen',
};

const RISK_COLORS: Record<number, string> = {
  1: 'text-blue-400', 2: 'text-blue-400', 3: 'text-cyan-400',
  4: 'text-green-400', 5: 'text-green-400', 6: 'text-yellow-400',
  7: 'text-orange-400', 8: 'text-orange-400',
  9: 'text-red-400', 10: 'text-red-500',
};

const RISK_BG: Record<number, string> = {
  1: 'bg-blue-400/10 border-blue-400/20', 2: 'bg-blue-400/10 border-blue-400/20', 3: 'bg-cyan-400/10 border-cyan-400/20',
  4: 'bg-green-400/10 border-green-400/20', 5: 'bg-green-400/10 border-green-400/20', 6: 'bg-yellow-400/10 border-yellow-400/20',
  7: 'bg-orange-400/10 border-orange-400/20', 8: 'bg-orange-400/10 border-orange-400/20',
  9: 'bg-red-400/10 border-red-400/20', 10: 'bg-red-500/10 border-red-500/20',
};

const SIGNAL_LABELS: Record<string, string> = {
  priceAction: 'price action',
  volume: 'volume',
  tickMovement: 'tick movement',
  lpConcentration: 'LP concentration',
  volatility: 'volatility',
};

const EXPLORER_TX = (hash: string) =>
  `https://base-sepolia-testnet-explorer.skalenodes.com:10032/tx/${hash}`;

export default function AgentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address: userAddress } = useWallet();
  const queryClient = useQueryClient();
  const fundAgent = useFundAgent();
  const [fundAmount, setFundAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [txMessage, setTxMessage] = useState<{ type: 'success' | 'error'; text: string; txHash?: string } | null>(null);

  const refreshBalance = () => {
    queryClient.invalidateQueries({ queryKey: ['agent-balance', id] });
    queryClient.invalidateQueries({ queryKey: ['agents'] });
  };

  const handleFund = async () => {
    const amt = parseFloat(fundAmount);
    if (!amt || amt <= 0 || !agent) return;
    setTxMessage(null);
    try {
      const hash = await fundAgent.fund(id, agent.walletAddress, amt);
      setTxMessage({ type: 'success', text: `Funded $${amt} USDC from your wallet`, txHash: hash });
      setFundAmount('');
      refreshBalance();
    } catch (err: any) {
      setTxMessage({ type: 'error', text: err.message });
    }
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0 || !userAddress) return;
    setWithdrawLoading(true);
    setTxMessage(null);
    try {
      const res = await fetch(`/api/agent/${id}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, toAddress: userAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTxMessage({ type: 'success', text: `Withdrew $${amt} USDC to ${userAddress.slice(0, 8)}...`, txHash: data.txHash });
      setWithdrawAmount('');
      refreshBalance();
    } catch (err: any) {
      setTxMessage({ type: 'error', text: err.message });
    } finally {
      setWithdrawLoading(false);
    }
  };

  const { data: agents, isLoading: agentsLoading } = useQuery<StoredAgent[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error('Failed to fetch agents');
      return res.json();
    },
  });

  const agent = agents?.find((a) => a.id === id);

  const { data: balanceData } = useQuery<{ balance: string; formatted: string }>({
    queryKey: ['agent-balance', id],
    queryFn: async () => {
      const res = await fetch(`/api/agent/${id}/balance`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
    enabled: !!agent,
    refetchInterval: 10000,
  });

  const risk = agent?.config?.riskTolerance ?? 5;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#0a0a0a]">
        <Header />
        <main className="max-w-[1400px] mx-auto px-8 pt-24 pb-20">

          {/* Loading state */}
          {agentsLoading && (
            <div className="flex items-center justify-center py-32">
              <div className="text-[16px] text-[#666] font-mono animate-pulse">loading agent...</div>
            </div>
          )}

          {/* Not found state */}
          {!agentsLoading && !agent && (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <div className="text-[18px] text-[#666] font-mono">agent not found</div>
              <Link href="/agents" className="text-[14px] text-[#888] font-mono hover:text-[#ededed] transition-colors">
                &larr; back to agents
              </Link>
            </div>
          )}

          {agent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {/* ── TOP: Back link + Agent hero ── */}
              <div className="mb-10">
                <Link
                  href="/agents"
                  className="inline-flex items-center gap-2 text-[14px] text-[#666] font-mono hover:text-[#ededed] transition-colors mb-8"
                >
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                    <path d="M7.5 2.5L4 6L7.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  back to agents
                </Link>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="flex items-start gap-6"
                >
                  <div className="w-24 h-24 rounded-xl overflow-hidden bg-[#111] border border-[#1a1a1a] flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={AVATAR_URL(agent.name)} alt="" width={96} height={96} />
                  </div>
                  <div className="min-w-0 pt-1">
                    <h1 className="font-pixel text-[2rem] text-[#ededed] tracking-wider mb-2">{agent.name}</h1>
                    {agent.personality && (
                      <p className="text-[15px] text-[#888] font-mono italic leading-relaxed mb-3 max-w-[600px]">
                        &ldquo;{agent.personality}&rdquo;
                      </p>
                    )}
                    <span className={`inline-block text-[13px] font-mono px-3 py-1 rounded border ${RISK_BG[risk]} ${RISK_COLORS[risk]}`}>
                      risk {risk}/10 &mdash; {RISK_LABELS[risk]}
                    </span>
                  </div>
                </motion.div>
              </div>

              {/* ── COLUMNS ── */}
              <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-8">

                {/* ── LEFT: Stats & Identity ── */}
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-5"
                >
                  {/* ERC-8004 Identity */}
                  <div className="rounded-xl border border-[#1a1a1a] p-6">
                    <div className="text-[12px] text-[#555] font-mono tracking-widest mb-4">ERC-8004 IDENTITY</div>
                    <div className="space-y-4">
                      <div>
                        <div className="text-[12px] text-[#666] font-mono mb-1">on-chain ID</div>
                        <div className="text-[18px] text-[#ededed] font-mono">#{agent.onChainId}</div>
                      </div>
                      <div>
                        <div className="text-[12px] text-[#666] font-mono mb-1">registration tx</div>
                        <a
                          href={EXPLORER_TX(agent.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[15px] text-cyan-400 font-mono hover:text-cyan-300 transition-colors"
                        >
                          <span className="break-all">{agent.txHash}</span>
                          <svg className="inline ml-1.5 -mt-0.5 shrink-0" width="12" height="12" viewBox="0 0 10 10" fill="none">
                            <path d="M3 7L7 3M7 3H4M7 3V6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Wallet */}
                  <div className="rounded-xl border border-[#1a1a1a] p-6">
                    <div className="text-[12px] text-[#555] font-mono tracking-widest mb-4">WALLET</div>
                    <div className="space-y-4">
                      <div>
                        <div className="text-[12px] text-[#666] font-mono mb-1">address</div>
                        <div className="text-[13px] text-[#ededed] font-mono break-all leading-relaxed">
                          {agent.walletAddress}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${agent.funded ? 'bg-green-400' : 'bg-yellow-500 animate-pulse'}`} />
                        <span className={`text-[14px] font-mono font-medium ${agent.funded ? 'text-green-400' : 'text-yellow-500'}`}>
                          {agent.funded ? 'FUNDED' : 'UNFUNDED'}
                        </span>
                      </div>
                      <div>
                        <div className="text-[12px] text-[#666] font-mono mb-1">USDC balance</div>
                        <div className="text-[28px] text-[#ededed] font-mono font-medium">
                          {balanceData?.formatted ?? '--'}
                        </div>
                      </div>

                      {/* Fund */}
                      <div className="pt-4 border-t border-[#1a1a1a]">
                        <div className="text-[12px] text-[#666] font-mono mb-2">
                          fund from your wallet
                          {userAddress && (
                            <span className="text-[#555] ml-1">({userAddress.slice(0, 6)}...{userAddress.slice(-4)})</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#555] font-mono">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max="100"
                              value={fundAmount}
                              onChange={e => setFundAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-7 pr-3 py-2.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg text-[15px] text-[#ededed] font-mono placeholder:text-[#444] focus:outline-none focus:border-[#333]"
                            />
                          </div>
                          <button
                            onClick={handleFund}
                            disabled={fundAgent.isPending || !fundAmount || !userAddress}
                            className="px-5 py-2.5 bg-green-500/10 text-green-400 text-[13px] font-mono rounded-lg border border-green-500/20 hover:bg-green-500/20 disabled:opacity-30 transition-colors whitespace-nowrap"
                          >
                            {fundAgent.isPending
                              ? fundAgent.status === 'exporting' ? 'exporting...'
                              : fundAgent.status === 'sending' ? 'sending...'
                              : fundAgent.status === 'confirming' ? 'confirming...'
                              : '...'
                              : 'fund'}
                          </button>
                        </div>
                      </div>

                      {/* Withdraw */}
                      <div className="pt-4 border-t border-[#1a1a1a]">
                        <div className="text-[12px] text-[#666] font-mono mb-2">
                          withdraw to your wallet
                          {userAddress && (
                            <span className="text-[#555] ml-1">({userAddress.slice(0, 6)}...{userAddress.slice(-4)})</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#555] font-mono">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={withdrawAmount}
                              onChange={e => setWithdrawAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-7 pr-3 py-2.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg text-[15px] text-[#ededed] font-mono placeholder:text-[#444] focus:outline-none focus:border-[#333]"
                            />
                          </div>
                          <button
                            onClick={handleWithdraw}
                            disabled={withdrawLoading || !withdrawAmount || !userAddress}
                            className="px-5 py-2.5 bg-red-500/10 text-red-400 text-[13px] font-mono rounded-lg border border-red-500/20 hover:bg-red-500/20 disabled:opacity-30 transition-colors whitespace-nowrap"
                          >
                            {withdrawLoading ? '...' : 'withdraw'}
                          </button>
                        </div>
                      </div>

                      {/* Tx feedback */}
                      {txMessage && (
                        <div className={`text-[13px] font-mono py-2.5 px-3 rounded-lg ${
                          txMessage.type === 'success'
                            ? 'text-green-400 bg-green-500/5'
                            : 'text-red-400 bg-red-500/5'
                        }`}>
                          {txMessage.text}
                          {txMessage.type === 'success' && txMessage.txHash && (
                            <a
                              href={EXPLORER_TX(txMessage.txHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block mt-1.5 text-[12px] text-cyan-400 hover:text-cyan-300 transition-colors truncate"
                            >
                              {txMessage.txHash}
                              <svg className="inline ml-1 -mt-0.5" width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M3 7L7 3M7 3H4M7 3V6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Record */}
                  <div className="rounded-xl border border-[#1a1a1a] p-6">
                    <div className="text-[12px] text-[#555] font-mono tracking-widest mb-4">RECORD</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[12px] text-[#666] font-mono mb-1">matches</div>
                        <div className="text-[28px] text-[#ededed] font-mono">{agent.arenaCount}</div>
                      </div>
                      <div>
                        <div className="text-[12px] text-[#666] font-mono mb-1">trades</div>
                        <div className="text-[28px] text-[#ededed] font-mono">{agent.totalTrades}</div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* ── RIGHT: Configuration ── */}
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                  className="space-y-5"
                >
                  {/* Trading Pairs */}
                  <div className="rounded-xl border border-[#1a1a1a] p-6">
                    <div className="text-[12px] text-[#555] font-mono tracking-widest mb-4">TRADING PAIRS</div>
                    <div className="flex flex-wrap gap-2.5">
                      {agent.config.tradingPairs.map((pair) => (
                        <span
                          key={pair}
                          className="px-4 py-2 text-[14px] font-mono text-[#ededed] rounded-lg border border-[#ededed]/20 bg-[#ededed]/5"
                        >
                          {pair}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Risk & Execution */}
                  <div className="rounded-xl border border-[#1a1a1a] p-6">
                    <div className="text-[12px] text-[#555] font-mono tracking-widest mb-4">RISK &amp; EXECUTION</div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] text-[#777] font-mono">risk tolerance</span>
                        <span className={`text-[15px] font-mono font-medium ${RISK_COLORS[risk]}`}>
                          {risk}/10 &mdash; {RISK_LABELS[risk]}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] text-[#777] font-mono">execution speed</span>
                        <span className="text-[15px] text-[#ededed] font-mono">{agent.config.executionSpeed}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] text-[#777] font-mono">max position size</span>
                        <span className="text-[15px] text-[#ededed] font-mono">{agent.config.maxPositionSize}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] text-[#777] font-mono">stop-loss</span>
                        <span className="text-[15px] text-[#ededed] font-mono">{agent.config.stopLoss}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] text-[#777] font-mono">take-profit</span>
                        <span className="text-[15px] text-[#ededed] font-mono">{agent.config.takeProfit}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] text-[#777] font-mono">max drawdown</span>
                        <span className="text-[15px] text-[#ededed] font-mono">{agent.config.maxDrawdown}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Signal Sources */}
                  <div className="rounded-xl border border-[#1a1a1a] p-6">
                    <div className="text-[12px] text-[#555] font-mono tracking-widest mb-4">SIGNAL SOURCES</div>
                    <div className="flex flex-wrap gap-2.5">
                      {Object.entries(SIGNAL_LABELS).map(([key, label]) => {
                        const on = agent.config.signals[key as keyof typeof agent.config.signals];
                        return (
                          <span
                            key={key}
                            className={`px-3.5 py-1.5 text-[13px] font-mono rounded-lg border transition-colors ${
                              on
                                ? 'border-[#ededed]/20 bg-[#ededed]/5 text-[#ededed]'
                                : 'border-[#1a1a1a] text-[#555]'
                            }`}
                          >
                            {on ? '+' : '-'} {label}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Behavior */}
                  <div className="rounded-xl border border-[#1a1a1a] p-6">
                    <div className="text-[12px] text-[#555] font-mono tracking-widest mb-4">BEHAVIOR</div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] text-[#777] font-mono">contrarian mode</span>
                        {agent.config.contrarian ? (
                          <span className="text-[14px] font-mono text-violet-400 font-medium">ACTIVE</span>
                        ) : (
                          <span className="text-[14px] font-mono text-[#555]">off</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] text-[#777] font-mono">max trades / round</span>
                        <span className="text-[15px] text-[#ededed] font-mono">{agent.config.maxTradesPerRound}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] text-[#777] font-mono">rebalance threshold</span>
                        <span className="text-[15px] text-[#ededed] font-mono">{agent.config.rebalanceThreshold}%</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Encrypted Data ── */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="rounded-xl border border-[#1a1a1a] p-6"
                  >
                    <div className="text-[12px] text-[#555] font-mono tracking-widest mb-4">ENCRYPTED DATA</div>
                    <div className="space-y-4">
                      <div>
                        <div className="text-[12px] text-[#666] font-mono mb-1">encrypted config</div>
                        <div className="text-[13px] text-[#555] font-mono break-all leading-relaxed">
                          {agent.encryptedConfig.slice(0, 50)}...
                        </div>
                      </div>
                      <div>
                        <div className="text-[12px] text-[#666] font-mono mb-1">encrypted personality</div>
                        <div className="text-[13px] text-[#555] font-mono break-all leading-relaxed">
                          {agent.encryptedPersonality.slice(0, 50)}...
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-[#1a1a1a] flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/80" />
                      <span className="text-[12px] text-yellow-500/80 font-mono">
                        BITE threshold encrypted on SKALE
                      </span>
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>
          )}

        </main>
      </div>
    </AuthGuard>
  );
}
