'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CipherText } from './cipher-text';
import { playSound } from '@/lib/sounds';

interface LeaderboardEntry {
  rank: number;
  agentName: string;
  agentId: string;
  tradeCount: number;
  pnl: number;
  pnlPercent?: string;
}

interface BiteStep {
  step: string;
  label: string;
  count: number;
}

interface RevealOverlayProps {
  leaderboard: LeaderboardEntry[];
  biteSteps?: BiteStep[];
  x402Summary?: { payments: number; totalUsd: number };
  onDismiss?: () => void;
}

const AVATAR_URL = (name: string) =>
  `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(name)}&size=64&backgroundColor=0a0a0a`;

// Cipher rain characters
const CIPHER_CHARS = '0123456789abcdef';

function CipherRain() {
  const columns = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      left: `${(i / 30) * 100}%`,
      delay: Math.random() * 2,
      duration: 1 + Math.random() * 2,
      chars: Array.from({ length: 12 }, () => CIPHER_CHARS[Math.floor(Math.random() * 16)]).join('\n'),
    })),
  []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
      {columns.map((col, i) => (
        <div
          key={i}
          className="absolute top-0 font-mono text-[10px] text-cyan-400 whitespace-pre leading-[1.2] animate-[cipherFall_3s_linear_infinite]"
          style={{
            left: col.left,
            animationDelay: `${col.delay}s`,
            animationDuration: `${col.duration}s`,
          }}
        >
          {col.chars}
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

const DEFAULT_BITE_STEPS: BiteStep[] = [
  { step: 'ENCRYPT', label: 'Strategies encrypted', count: 0 },
  { step: 'SEAL', label: 'Joined arena on-chain', count: 0 },
  { step: 'x402', label: 'Agent commerce', count: 0 },
  { step: 'TRADE', label: 'Encrypted trades', count: 0 },
  { step: 'CONDITION', label: 'Timer expired', count: 0 },
  { step: 'REVEAL', label: 'Batch decrypt', count: 0 },
  { step: 'SETTLE', label: 'Results published', count: 0 },
];

export function RevealOverlay({ leaderboard, biteSteps, x402Summary, onDismiss }: RevealOverlayProps) {
  const [phase, setPhase] = useState<'cipher' | 'lifecycle' | 'revealing' | 'done'>('cipher');
  const [revealedCount, setRevealedCount] = useState(0);
  const [lifecycleStep, setLifecycleStep] = useState(0);

  const steps = biteSteps || DEFAULT_BITE_STEPS;

  // Phase 1: Cipher rain (2s)
  useEffect(() => {
    const t1 = setTimeout(() => {
      playSound('reveal');
      setPhase('lifecycle');
    }, 2000);
    return () => clearTimeout(t1);
  }, []);

  // Phase 2: BITE lifecycle animation
  useEffect(() => {
    if (phase !== 'lifecycle') return;
    const interval = setInterval(() => {
      setLifecycleStep(prev => {
        const next = prev + 1;
        if (next >= steps.length) {
          clearInterval(interval);
          setTimeout(() => setPhase('revealing'), 500);
        }
        playSound('tick');
        return next;
      });
    }, 400);
    return () => clearInterval(interval);
  }, [phase, steps.length]);

  // Phase 3: Reveal each agent one by one
  useEffect(() => {
    if (phase !== 'revealing') return;
    const interval = setInterval(() => {
      setRevealedCount(prev => {
        const next = prev + 1;
        if (next >= leaderboard.length) {
          clearInterval(interval);
          setTimeout(() => setPhase('done'), 500);
        }
        playSound('tick');
        return next;
      });
    }, 600);
    return () => clearInterval(interval);
  }, [phase, leaderboard.length]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a]/97 flex items-center justify-center">
      {/* Cipher rain background */}
      {phase === 'cipher' && <CipherRain />}

      <div className="max-w-lg w-full mx-4 relative z-10">
        {/* Phase 1: Cipher rain + DECRYPTING */}
        <AnimatePresence>
          {phase === 'cipher' && (
            <motion.div
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <div className="font-pixel text-[2rem] sm:text-[2.5rem] text-cyan-400 tracking-wider mb-3 animate-pulse">
                DECRYPTING...
              </div>
              <div className="text-[11px] font-mono text-[#444]">BITE CTX batch decrypting all strategies</div>
              <div className="mt-6 w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase 2: BITE Lifecycle */}
        <AnimatePresence>
          {phase === 'lifecycle' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-6">
                <div className="font-pixel text-[1rem] text-yellow-500 tracking-widest mb-1">BITE LIFECYCLE</div>
                <div className="text-[10px] font-mono text-[#444]">encrypted → condition → decrypt → settle</div>
              </div>

              <div className="space-y-2">
                {steps.map((step, i) => {
                  const isActive = i < lifecycleStep;
                  const isCurrent = i === lifecycleStep;
                  return (
                    <motion.div
                      key={step.step}
                      initial={{ opacity: 0.3 }}
                      animate={{ opacity: isActive || isCurrent ? 1 : 0.3 }}
                      className={`flex items-center gap-3 px-4 py-2 rounded-lg border transition-all ${
                        isActive ? 'border-green-500/30 bg-green-500/5' :
                        isCurrent ? 'border-yellow-500/30 bg-yellow-500/5' :
                        'border-[#111] bg-[#0a0a0a]'
                      }`}
                    >
                      <span className={`text-[14px] ${isActive ? 'text-green-500' : isCurrent ? 'text-yellow-500 animate-pulse' : 'text-[#333]'}`}>
                        {isActive ? '\u2713' : isCurrent ? '\u25ce' : '\u25cb'}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-mono font-medium ${
                            step.step === 'x402' ? (isActive ? 'text-emerald-400' : 'text-[#555]') :
                            isActive ? 'text-yellow-500' : 'text-[#555]'
                          }`}>
                            {step.step}
                          </span>
                          <span className="text-[10px] font-mono text-[#666]">{step.label}</span>
                        </div>
                      </div>
                      {step.count > 0 && (
                        <span className="text-[10px] font-mono text-[#666]">{step.count}</span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase 3+4: Revealing + Done */}
        {(phase === 'revealing' || phase === 'done') && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="text-center mb-6">
              <div className="font-pixel text-[1.2rem] text-[#ededed] tracking-widest mb-1">
                LEADERBOARD
              </div>
              <div className="text-[10px] font-mono text-[#444]">
                strategies decrypted &middot; results final
              </div>
            </div>

            <div className="space-y-2">
              {leaderboard.map((entry, i) => {
                const isRevealed = i < revealedCount;
                const isWinner = i === 0 && phase === 'done';
                const pnlValue = parseFloat(entry.pnlPercent || String(entry.pnl / 100));
                const pnlBps = entry.pnl;

                return (
                  <motion.div
                    key={entry.agentId || i}
                    initial={{ opacity: 0.3, x: 0 }}
                    animate={{
                      opacity: isRevealed ? 1 : 0.3,
                      x: isRevealed && i === revealedCount - 1 ? [0, 4, -4, 0] : 0,
                    }}
                    transition={{ duration: 0.3 }}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      isRevealed
                        ? isWinner
                          ? 'border-yellow-500/40 bg-yellow-500/5'
                          : 'border-[#1a1a1a] bg-[#111]'
                        : 'border-[#111] bg-[#0a0a0a]'
                    }`}
                  >
                    {/* Rank */}
                    <span
                      className={`font-pixel text-[18px] w-8 text-center tracking-wider ${
                        i === 0 ? 'text-yellow-500' : i === 1 ? 'text-[#999]' : i === 2 ? 'text-orange-600' : 'text-[#444]'
                      }`}
                    >
                      #{entry.rank}
                    </span>

                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#111] flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={AVATAR_URL(entry.agentName)}
                        alt={entry.agentName}
                        width={36}
                        height={36}
                        className="w-full h-full"
                      />
                    </div>

                    {/* Name + trades */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-[#ededed] font-medium truncate">
                        {isWinner && <span className="text-yellow-500 mr-1">&diams;</span>}
                        {entry.agentName}
                      </div>
                      <div className="text-[10px] font-mono text-[#444]">{entry.tradeCount} trades</div>
                    </div>

                    {/* P&L */}
                    <div className="text-right">
                      {isRevealed ? (
                        <div>
                          <span className={`font-pixel text-[16px] tracking-wider ${pnlValue >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                            {pnlBps >= 0 ? '+' : ''}{pnlBps} bps
                          </span>
                          <div className={`text-[9px] font-mono ${pnlValue >= 0 ? 'text-green-500/50' : 'text-red-400/50'}`}>
                            {pnlValue >= 0 ? '+' : ''}{pnlValue.toFixed(2)}%
                          </div>
                        </div>
                      ) : (
                        <CipherText
                          text="???bps"
                          scrambling={true}
                          className="font-pixel text-[16px] text-[#333] tracking-wider"
                        />
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* x402 Commerce Summary */}
            {phase === 'done' && x402Summary && x402Summary.payments > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 text-center text-[10px] font-mono text-emerald-400"
              >
                {x402Summary.payments} intel purchases &middot; ${x402Summary.totalUsd.toFixed(2)} settled via x402
              </motion.div>
            )}

            {/* Dismiss */}
            {phase === 'done' && onDismiss && (
              <button
                onClick={onDismiss}
                className="w-full mt-6 py-3 text-[13px] font-medium text-[#ededed] bg-[#1a1a1a] rounded-lg hover:bg-[#222] transition-colors"
              >
                back to arena
              </button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
