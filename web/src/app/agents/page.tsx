'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/layout/header';
import { AuthGuard } from '@/components/shared/auth-guard';
import { useAgents, useRegisterAgent } from '@/hooks/use-agents';
import { useChatCreateAgent } from '@/hooks/use-match';
import { useWallet } from '@/hooks/use-wallet';
import { type AgentConfig, DEFAULT_AGENT_CONFIG } from '@/lib/agent-builder';
import { playSound } from '@/lib/sounds';

const AVATAR_URL = (name: string) =>
  `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(name)}&size=80&backgroundColor=0a0a0a`;

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

type CreationMode = 'prompt' | 'wizard' | null;

const WIZARD_STEPS = ['Identity', 'Strategy', 'Risk Management', 'Review'];

export default function AgentsPage() {
  const { data: agents } = useAgents();
  const registerAgent = useRegisterAgent();
  const chatCreate = useChatCreateAgent();
  const { address } = useWallet();

  const [mode, setMode] = useState<CreationMode>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [config, setConfig] = useState<AgentConfig>({ ...DEFAULT_AGENT_CONFIG });
  const [chatPrompt, setChatPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingPhase, setCreatingPhase] = useState('');

  const resetCreation = () => {
    setMode(null);
    setWizardStep(0);
    setConfig({ ...DEFAULT_AGENT_CONFIG });
    setChatPrompt('');
    setCreating(false);
    setCreatingPhase('');
  };

  const handlePromptCreate = async () => {
    if (!chatPrompt.trim() || creating) return;
    setCreating(true);
    try {
      setCreatingPhase('generating config...');
      playSound('tick');
      const result = await chatCreate.mutateAsync({ prompt: chatPrompt });
      if (!result.config) throw new Error('No config generated');

      setCreatingPhase('encrypting + registering on-chain...');
      const owner = address || 'server';
      await registerAgent.mutateAsync({ ...result.config, owner });
      playSound('join');
      resetCreation();
    } catch (err) {
      console.error('Prompt create failed:', err);
      setCreating(false);
      setCreatingPhase('');
    }
  };

  const handleWizardRegister = async () => {
    if (!config.name.trim() || creating) return;
    setCreating(true);
    try {
      setCreatingPhase('encrypting + registering on-chain...');
      playSound('join');
      const owner = address || 'server';
      await registerAgent.mutateAsync({ ...config, owner });
      resetCreation();
    } catch (err) {
      console.error('Wizard register failed:', err);
      setCreating(false);
      setCreatingPhase('');
    }
  };

  return (
    <AuthGuard>
    <div className="min-h-screen bg-[#0a0a0a]">
      <Header />
      <main className="max-w-[1400px] mx-auto px-8 pt-24 pb-20">

        {/* Page heading */}
        <div className="mb-12">
          <h1 className="font-pixel text-[2.8rem] text-[#ededed] tracking-wider mb-2">AGENT LAB</h1>
          <p className="text-[17px] text-[#777] font-mono">
            design an autonomous AI trading agent &middot; BITE encrypted on-chain
          </p>
        </div>

        {/* ── YOUR AGENTS ── */}
        <div className="mb-14">
          <div className="flex items-center justify-between mb-5">
            <div className="text-[13px] text-[#666] font-mono tracking-widest">
              YOUR AGENTS ({agents?.length || 0})
            </div>
            <div className="flex items-center gap-2 text-[12px] font-mono text-yellow-500/80">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/80" />
              BITE encrypted
            </div>
          </div>

          {(!agents || agents.length === 0) ? (
            <div className="rounded-xl border border-[#1a1a1a] py-16 text-center">
              <div className="text-[16px] text-[#666] font-mono">no agents deployed yet</div>
              <div className="text-[14px] text-[#555] font-mono mt-2">create your first one below</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent: any, i: number) => (
                <Link key={agent.id} href={`/agents/${agent.id}`} className="block">
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-xl border border-[#1a1a1a] p-5 hover:border-[#2a2a2a] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5 mb-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#111] border border-[#1a1a1a] flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={AVATAR_URL(agent.name)} alt="" width={48} height={48} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[16px] text-[#ededed] font-medium truncate">{agent.name}</div>
                        <span className={`text-[12px] font-mono ${RISK_COLORS[agent.config?.riskTolerance] || 'text-[#444]'}`}>
                          risk {agent.config?.riskTolerance || '?'}/10
                        </span>
                      </div>
                    </div>
                    {agent.config?.personality && (
                      <p className="text-[13px] text-[#888] font-mono leading-relaxed line-clamp-2 mb-3">
                        {agent.config.personality}
                      </p>
                    )}
                    {agent.walletAddress && (
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`w-2 h-2 rounded-full ${agent.funded ? 'bg-green-400' : 'bg-yellow-500 animate-pulse'}`} />
                        <span className="text-[12px] font-mono text-[#666] truncate" title={agent.walletAddress}>
                          {agent.walletAddress.slice(0, 6)}...{agent.walletAddress.slice(-4)}
                        </span>
                        {agent.funded && (
                          <span className="text-[11px] font-mono text-green-400/80 ml-auto">FUNDED</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[12px] font-mono text-[#666]">
                      {agent.config?.tradingPairs?.map((p: string) => (
                        <span key={p} className="bg-[#111] px-2 py-0.5 rounded">{p}</span>
                      ))}
                      <span className="ml-auto text-[#777]">{agent.arenaCount || 0} matches</span>
                    </div>
                    {agent.funded && (
                      <div
                        className="mt-3 block w-full py-2 text-center text-[13px] font-mono text-cyan-400 border border-cyan-500/20 rounded-lg hover:bg-cyan-500/5 transition-colors"
                        onClick={(e) => { e.preventDefault(); window.location.href = '/play'; }}
                      >
                        READY TO PLAY &rarr;
                      </div>
                    )}
                  </motion.div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── CREATE NEW AGENT ── */}
        <div>
          <div className="text-[13px] text-[#666] font-mono tracking-widest mb-5">CREATE NEW AGENT</div>

          <AnimatePresence mode="wait">
            {/* Mode selector */}
            {mode === null && (
              <motion.div
                key="selector"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                <button
                  onClick={() => { setMode('prompt'); playSound('tick'); }}
                  className="group rounded-xl border border-[#1a1a1a] p-8 text-left hover:border-[#333] transition-all hover:shadow-[0_0_60px_rgba(34,211,238,0.06)]"
                >
                  <div className="text-[28px] mb-4 opacity-60 group-hover:opacity-100 transition-opacity">&#9998;</div>
                  <div className="text-[20px] text-[#ededed] font-medium mb-2">Describe Your Agent</div>
                  <p className="text-[15px] text-[#777] font-mono leading-relaxed">
                    Type a description in plain English. AI generates the full config and registers on-chain.
                  </p>
                  <div className="mt-4 text-[13px] font-mono text-cyan-400/70">fastest &middot; one step</div>
                </button>

                <button
                  onClick={() => { setMode('wizard'); playSound('tick'); }}
                  className="group rounded-xl border border-[#1a1a1a] p-8 text-left hover:border-[#333] transition-all hover:shadow-[0_0_60px_rgba(167,139,250,0.06)]"
                >
                  <div className="text-[28px] mb-4 opacity-60 group-hover:opacity-100 transition-opacity">&#9881;</div>
                  <div className="text-[20px] text-[#ededed] font-medium mb-2">Advanced Builder</div>
                  <p className="text-[15px] text-[#777] font-mono leading-relaxed">
                    Step-by-step wizard. Full control over every parameter — risk, pairs, signals, execution.
                  </p>
                  <div className="mt-4 text-[13px] font-mono text-violet-400/70">4 steps &middot; full control</div>
                </button>
              </motion.div>
            )}

            {/* ── PROMPT MODE ── */}
            {mode === 'prompt' && (
              <motion.div
                key="prompt"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="max-w-[800px]"
              >
                <button
                  onClick={resetCreation}
                  className="flex items-center gap-2 text-[14px] font-mono text-[#777] hover:text-[#ededed] transition-colors mb-6"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  back
                </button>

                <div className="rounded-xl border border-[#1a1a1a] p-6">
                  <div className="text-[18px] text-[#ededed] font-medium mb-1">Describe your agent</div>
                  <p className="text-[14px] text-[#777] font-mono mb-5">
                    Tell us how your agent should think and trade. We&apos;ll handle the rest.
                  </p>

                  <textarea
                    value={chatPrompt}
                    onChange={e => setChatPrompt(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handlePromptCreate();
                      }
                    }}
                    placeholder={`"An aggressive ETH scalper that buys every dip and rides momentum..."\n\n"Conservative bot, only trades low-volatility windows, never risks more than 10%..."\n\n"Contrarian that fades every move — when the crowd buys, it sells..."`}
                    disabled={creating}
                    className="w-full px-4 py-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg text-[#ededed] text-[16px] font-mono placeholder:text-[#555] focus:outline-none focus:border-[#333] transition-colors resize-none min-h-[180px] disabled:opacity-50"
                  />

                  <button
                    onClick={handlePromptCreate}
                    disabled={creating || !chatPrompt.trim()}
                    className="mt-4 w-full py-3.5 bg-[#ededed] text-[#0a0a0a] text-[16px] font-semibold rounded-lg hover:bg-white disabled:opacity-30 transition-colors"
                  >
                    {creating ? (
                      <span className="animate-pulse">{creatingPhase}</span>
                    ) : (
                      'Create Agent'
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── WIZARD MODE ── */}
            {mode === 'wizard' && (
              <motion.div
                key="wizard"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="max-w-[800px]"
              >
                <button
                  onClick={() => {
                    if (wizardStep === 0) resetCreation();
                    else setWizardStep(s => s - 1);
                  }}
                  className="flex items-center gap-2 text-[14px] font-mono text-[#777] hover:text-[#ededed] transition-colors mb-6"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {wizardStep === 0 ? 'back' : 'previous'}
                </button>

                {/* Step indicator */}
                <div className="flex items-center gap-3 mb-8">
                  {WIZARD_STEPS.map((label, i) => (
                    <div key={label} className="flex items-center gap-3">
                      <button
                        onClick={() => i < wizardStep && setWizardStep(i)}
                        className={`flex items-center gap-2 transition-colors ${
                          i === wizardStep ? 'text-[#ededed]' : i < wizardStep ? 'text-[#777] cursor-pointer hover:text-[#aaa]' : 'text-[#444] cursor-default'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-full text-[13px] font-mono flex items-center justify-center border transition-colors ${
                          i === wizardStep ? 'border-[#ededed] bg-[#ededed] text-[#0a0a0a]'
                          : i < wizardStep ? 'border-[#555] text-[#888]'
                          : 'border-[#333] text-[#555]'
                        }`}>
                          {i < wizardStep ? (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          ) : (
                            i + 1
                          )}
                        </span>
                        <span className="text-[13px] font-mono hidden sm:block">{label}</span>
                      </button>
                      {i < WIZARD_STEPS.length - 1 && (
                        <div className={`w-8 h-px ${i < wizardStep ? 'bg-[#555]' : 'bg-[#222]'}`} />
                      )}
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-[#1a1a1a] p-6">
                  <AnimatePresence mode="wait">
                    {/* Step 0: Identity */}
                    {wizardStep === 0 && (
                      <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                        <div>
                          <label className="block text-[13px] text-[#777] font-mono mb-2">agent name</label>
                          <input
                            value={config.name}
                            onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
                            placeholder="Give your agent a name"
                            className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg text-[#ededed] text-[16px] font-mono placeholder:text-[#555] focus:outline-none focus:border-[#333] transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[13px] text-[#777] font-mono mb-2">personality</label>
                          <textarea
                            value={config.personality}
                            onChange={e => setConfig(c => ({ ...c, personality: e.target.value }))}
                            placeholder="How does your agent think and trade? e.g. 'Aggressive momentum trader that rides trends hard and cuts losses fast'"
                            rows={4}
                            className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg text-[#ededed] text-[15px] font-mono placeholder:text-[#555] focus:outline-none focus:border-[#333] transition-colors resize-none"
                          />
                        </div>
                      </motion.div>
                    )}

                    {/* Step 1: Strategy */}
                    {wizardStep === 1 && (
                      <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                        {/* Risk tolerance */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-[13px] text-[#777] font-mono">risk tolerance</label>
                            <span className={`text-[15px] font-mono font-medium ${RISK_COLORS[config.riskTolerance]}`}>
                              {config.riskTolerance}/10 &mdash; {RISK_LABELS[config.riskTolerance]}
                            </span>
                          </div>
                          <input
                            type="range" min={1} max={10}
                            value={config.riskTolerance}
                            onChange={e => setConfig(c => ({ ...c, riskTolerance: Number(e.target.value) }))}
                            className="w-full accent-[#ededed]"
                          />
                          <div className="flex justify-between text-[12px] font-mono text-[#666] mt-1">
                            <span>safe</span><span>moderate</span><span>aggressive</span><span>degen</span>
                          </div>
                        </div>

                        {/* Trading pairs */}
                        <div>
                          <label className="block text-[13px] text-[#777] font-mono mb-2">trading pairs</label>
                          <div className="flex gap-3">
                            {['ETH/USDC', 'WBTC/USDC', 'ETH/WBTC'].map(pair => {
                              const checked = config.tradingPairs.includes(pair);
                              return (
                                <button
                                  key={pair}
                                  onClick={() => setConfig(c => ({
                                    ...c,
                                    tradingPairs: checked
                                      ? c.tradingPairs.filter(p => p !== pair)
                                      : [...c.tradingPairs, pair],
                                  }))}
                                  className={`px-4 py-2 text-[14px] font-mono rounded-lg border transition-colors ${
                                    checked
                                      ? 'border-[#ededed]/20 bg-[#ededed]/5 text-[#ededed]'
                                      : 'border-[#1a1a1a] text-[#777] hover:border-[#333] hover:text-[#aaa]'
                                  }`}
                                >
                                  {pair}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Execution speed */}
                        <div>
                          <label className="block text-[13px] text-[#777] font-mono mb-2">execution speed</label>
                          <div className="flex gap-3">
                            {(['patient', 'moderate', 'aggressive'] as const).map(speed => (
                              <button
                                key={speed}
                                onClick={() => setConfig(c => ({ ...c, executionSpeed: speed }))}
                                className={`flex-1 py-2.5 text-[14px] font-mono rounded-lg transition-colors ${
                                  config.executionSpeed === speed
                                    ? 'bg-[#ededed] text-[#0a0a0a] font-medium'
                                    : 'bg-[#111] text-[#777] hover:text-[#aaa]'
                                }`}
                              >
                                {speed}
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 2: Risk Management */}
                    {wizardStep === 2 && (
                      <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <SliderField label="max position" value={config.maxPositionSize} min={5} max={100} suffix="%" onChange={v => setConfig(c => ({ ...c, maxPositionSize: v }))} />
                          <SliderField label="stop-loss" value={config.stopLoss} min={1} max={25} suffix="%" onChange={v => setConfig(c => ({ ...c, stopLoss: v }))} />
                          <SliderField label="take-profit" value={config.takeProfit} min={2} max={100} suffix="%" onChange={v => setConfig(c => ({ ...c, takeProfit: v }))} />
                          <SliderField label="max drawdown" value={config.maxDrawdown} min={5} max={50} suffix="%" onChange={v => setConfig(c => ({ ...c, maxDrawdown: v }))} />
                          <SliderField label="rebalance threshold" value={config.rebalanceThreshold} min={1} max={20} suffix="%" onChange={v => setConfig(c => ({ ...c, rebalanceThreshold: v }))} />
                          <SliderField label="max trades/round" value={config.maxTradesPerRound} min={1} max={10} suffix="" onChange={v => setConfig(c => ({ ...c, maxTradesPerRound: v }))} />
                        </div>

                        {/* Signal sources */}
                        <div>
                          <label className="block text-[13px] text-[#777] font-mono mb-2">signal sources</label>
                          <div className="flex flex-wrap gap-2">
                            {([
                              ['priceAction', 'price action'],
                              ['volume', 'volume'],
                              ['tickMovement', 'tick movement'],
                              ['lpConcentration', 'LP concentration'],
                              ['volatility', 'volatility'],
                            ] as const).map(([key, label]) => {
                              const on = config.signals[key as keyof typeof config.signals];
                              return (
                                <button
                                  key={key}
                                  onClick={() => setConfig(c => ({
                                    ...c,
                                    signals: { ...c.signals, [key]: !on },
                                  }))}
                                  className={`px-3 py-1.5 text-[13px] font-mono rounded border transition-colors ${
                                    on
                                      ? 'border-[#ededed]/20 bg-[#ededed]/5 text-[#ededed]'
                                      : 'border-[#1a1a1a] text-[#666] hover:text-[#999]'
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Trading actions */}
                        <div>
                          <label className="block text-[13px] text-[#777] font-mono mb-2">trading actions</label>
                          <div className="flex gap-2">
                            {['swap', 'lp', 'limit'].map(action => {
                              const checked = config.tradingActions.includes(action);
                              return (
                                <button
                                  key={action}
                                  onClick={() => setConfig(c => ({
                                    ...c,
                                    tradingActions: checked
                                      ? c.tradingActions.filter(a => a !== action)
                                      : [...c.tradingActions, action],
                                  }))}
                                  className={`px-4 py-2 text-[13px] font-mono rounded border transition-colors ${
                                    checked
                                      ? 'border-[#ededed]/20 bg-[#ededed]/5 text-[#ededed]'
                                      : 'border-[#1a1a1a] text-[#666] hover:text-[#999]'
                                  }`}
                                >
                                  {action}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Contrarian */}
                        <button
                          onClick={() => setConfig(c => ({ ...c, contrarian: !c.contrarian }))}
                          className="flex items-center gap-3"
                        >
                          <div className={`w-10 h-5 rounded-full transition-colors relative ${
                            config.contrarian ? 'bg-violet-500' : 'bg-[#222]'
                          }`}>
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              config.contrarian ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                          </div>
                          <span className={`text-[14px] font-mono ${config.contrarian ? 'text-violet-400' : 'text-[#777]'}`}>
                            contrarian mode
                          </span>
                        </button>
                      </motion.div>
                    )}

                    {/* Step 3: Review */}
                    {wizardStep === 3 && (
                      <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <div className="flex items-start gap-6 mb-6">
                          <div className="w-20 h-20 rounded-xl overflow-hidden bg-[#111] border border-[#1a1a1a] flex-shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={AVATAR_URL(config.name || 'default')} alt="" width={80} height={80} />
                          </div>
                          <div>
                            <div className="text-[22px] text-[#ededed] font-medium mb-1">
                              {config.name || <span className="text-[#555]">unnamed</span>}
                            </div>
                            <span className={`inline-block text-[13px] font-mono px-2.5 py-1 rounded border ${RISK_BG[config.riskTolerance]} ${RISK_COLORS[config.riskTolerance]}`}>
                              risk {config.riskTolerance}/10 &mdash; {RISK_LABELS[config.riskTolerance]}
                            </span>
                            {config.personality && (
                              <p className="text-[14px] text-[#888] font-mono leading-relaxed mt-3 max-w-[500px]">
                                &ldquo;{config.personality}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[14px] font-mono mb-6">
                          <div className="flex justify-between text-[#777]"><span>pairs</span><span className="text-[#aaa]">{config.tradingPairs.join(', ')}</span></div>
                          <div className="flex justify-between text-[#777]"><span>speed</span><span className="text-[#aaa]">{config.executionSpeed}</span></div>
                          <div className="flex justify-between text-[#777]"><span>max position</span><span className="text-[#aaa]">{config.maxPositionSize}%</span></div>
                          <div className="flex justify-between text-[#777]"><span>stop-loss</span><span className="text-[#aaa]">{config.stopLoss}%</span></div>
                          <div className="flex justify-between text-[#777]"><span>take-profit</span><span className="text-[#aaa]">{config.takeProfit}%</span></div>
                          <div className="flex justify-between text-[#777]"><span>max drawdown</span><span className="text-[#aaa]">{config.maxDrawdown}%</span></div>
                          <div className="flex justify-between text-[#777]"><span>max trades</span><span className="text-[#aaa]">{config.maxTradesPerRound}/round</span></div>
                          <div className="flex justify-between text-[#777]"><span>rebalance</span><span className="text-[#aaa]">{config.rebalanceThreshold}%</span></div>
                          {config.contrarian && (
                            <div className="flex justify-between text-[#777]"><span>mode</span><span className="text-violet-400">contrarian</span></div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5 mb-6">
                          {Object.entries(config.signals).filter(([,v]) => v).map(([k]) => (
                            <span key={k} className="text-[12px] font-mono text-[#777] bg-[#111] px-2 py-1 rounded">{k}</span>
                          ))}
                          {config.tradingActions.map(a => (
                            <span key={a} className="text-[12px] font-mono text-[#777] bg-[#111] px-2 py-1 rounded">{a}</span>
                          ))}
                        </div>

                        <button
                          onClick={handleWizardRegister}
                          disabled={creating || !config.name.trim()}
                          className="w-full py-3.5 bg-[#ededed] text-[#0a0a0a] text-[16px] font-semibold rounded-lg hover:bg-white disabled:opacity-30 transition-colors"
                        >
                          {creating ? (
                            <span className="animate-pulse">{creatingPhase}</span>
                          ) : (
                            'Register Agent'
                          )}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Next button (steps 0-2) */}
                  {wizardStep < 3 && (
                    <button
                      onClick={() => { setWizardStep(s => s + 1); playSound('tick'); }}
                      disabled={wizardStep === 0 && !config.name.trim()}
                      className="mt-6 w-full py-3 bg-[#1a1a1a] text-[#ededed] text-[15px] font-mono rounded-lg hover:bg-[#222] disabled:opacity-30 transition-colors"
                    >
                      Next &rarr;
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </main>
    </div>
    </AuthGuard>
  );
}

function SliderField({ label, value, min, max, suffix, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[13px] text-[#777] font-mono">{label}</label>
        <span className="text-[14px] text-[#ededed] font-mono">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[#ededed]"
      />
    </div>
  );
}
