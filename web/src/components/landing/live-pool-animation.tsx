'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const AGENTS = [
  { name: 'Alpha', deposit: '$0.20', color: '#22c55e', ticks: '[199,620 — 201,060]', lock: '30d', reward: '$0.39' },
  { name: 'Beta', deposit: '$0.15', color: '#666', ticks: '[198,400 — 202,280]', lock: '14d', reward: '$0.18' },
  { name: 'Gamma', deposit: '$0.30', color: '#444', ticks: '[194,000 — 206,680]', lock: '7d', reward: '$0.05' },
  { name: 'Delta', deposit: '$0.10', color: '#eab308', ticks: '[200,100 — 200,580]', lock: '60d', reward: '$0.10' },
  { name: 'Epsilon', deposit: '$0.25', color: '#ededed', ticks: '[199,100 — 201,580]', lock: '21d', reward: '$0.28' },
];

type Phase = 'filling' | 'sealed' | 'revealing' | 'rewards' | 'reset';

const SCRAMBLE_CHARS = '0123456789,—[] ';

function useScramble(target: string, active: boolean, duration: number = 600) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!active) { setText(''); return; }
    const len = target.length;
    const steps = 12;
    const stepDuration = duration / steps;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step >= steps) { setText(target); clearInterval(interval); return; }
      const revealed = Math.floor((step / steps) * len);
      let result = '';
      for (let i = 0; i < len; i++) {
        result += i < revealed ? target[i] : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
      setText(result);
    }, stepDuration);
    return () => clearInterval(interval);
  }, [target, active, duration]);

  return text;
}

function EncryptedText({ revealed, ticks }: { revealed: boolean; ticks: string }) {
  const decoded = useScramble(ticks, revealed);
  if (revealed && decoded) return <span className="text-green-500">{decoded}</span>;
  return (
    <span className="text-[#444]">
      {'['}<ScrambleNoise />{' — '}<ScrambleNoise />{']'}
    </span>
  );
}

function ScrambleNoise() {
  const [chars, setChars] = useState('???????');
  useEffect(() => {
    const interval = setInterval(() => {
      let s = '';
      for (let i = 0; i < 7; i++) s += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      setChars(s);
    }, 100);
    return () => clearInterval(interval);
  }, []);
  return <span className="inline-block w-[50px] text-center">{chars}</span>;
}

// Terminal lines synced to phases
type TermLine = { text: string; color: string };

const TERM_FILLING: TermLine[][] = [
  [{ text: '$ pixie deploy --pool {n} --agent alpha', color: '#666' }],
  [{ text: '# Analyzing USDC/WETH @ tick 200,340', color: '#ededed' }],
  [
    { text: '# Strategy computed → BITE encrypting', color: '#ededed' },
    { text: '~ 0x8f3a...c7d1 encrypted', color: '#eab308' },
  ],
  [{ text: '~ Depositing $0.20 sealed', color: '#eab308' }],
  [{ text: '+ 5/5 agents sealed into pool', color: '#22c55e' }],
];

const TERM_SEALED: TermLine[] = [
  { text: '---', color: '#1a1a1a' },
  { text: '$ pixie reveal --pool {n}', color: '#666' },
];

const TERM_REVEALING: TermLine[] = [
  { text: '! Submitting batch CTX...', color: '#eab308' },
  { text: '! 5 strategies decrypted in 2.1s', color: '#ededed' },
];

const TERM_REWARDS: TermLine[] = [
  { text: '+ Alpha: $0.39 reward (best range)', color: '#22c55e' },
  { text: '+ Epsilon: $0.28 reward', color: '#22c55e' },
  { text: '+ Beta: $0.18 reward', color: '#666' },
  { text: '+ Delta: $0.10 reward', color: '#444' },
  { text: '+ Gamma: $0.05 reward', color: '#444' },
];

export function LivePoolAnimation() {
  const [phase, setPhase] = useState<Phase>('filling');
  const [visibleAgents, setVisibleAgents] = useState(0);
  const [poolNum, setPoolNum] = useState(3);
  const [termLines, setTermLines] = useState<TermLine[]>([]);
  const termRef = useRef<HTMLDivElement>(null);

  const addLines = useCallback((lines: TermLine[], poolN: number) => {
    setTermLines((prev) => [
      ...prev,
      ...lines.map((l) => ({ ...l, text: l.text.replace('{n}', String(poolN)) })),
    ]);
  }, []);

  const reset = useCallback(() => {
    setPhase('reset');
    setVisibleAgents(0);
    setTimeout(() => {
      setTermLines([]);
      setPoolNum((n) => n + 1);
      setPhase('filling');
    }, 800);
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [termLines]);

  // Phase machine
  useEffect(() => {
    if (phase === 'filling') {
      if (visibleAgents < AGENTS.length) {
        const timer = setTimeout(() => {
          setVisibleAgents((v) => v + 1);
          if (TERM_FILLING[visibleAgents]) {
            addLines(TERM_FILLING[visibleAgents], poolNum);
          }
        }, 700);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => setPhase('sealed'), 1000);
        return () => clearTimeout(timer);
      }
    }
    if (phase === 'sealed') {
      addLines(TERM_SEALED, poolNum);
      const timer = setTimeout(() => setPhase('revealing'), 2000);
      return () => clearTimeout(timer);
    }
    if (phase === 'revealing') {
      addLines(TERM_REVEALING, poolNum);
      const timer = setTimeout(() => setPhase('rewards'), 1500);
      return () => clearTimeout(timer);
    }
    if (phase === 'rewards') {
      addLines(TERM_REWARDS, poolNum);
      const timer = setTimeout(() => reset(), 3500);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visibleAgents]);

  const isRevealed = phase === 'revealing' || phase === 'rewards';
  const showRewards = phase === 'rewards';

  const statusText =
    phase === 'filling' ? `${visibleAgents}/${AGENTS.length} agents joining` :
    phase === 'sealed' ? 'all sealed — triggering reveal' :
    phase === 'revealing' ? 'BATCH CTX — decrypting...' :
    phase === 'rewards' ? 'rewards distributed' : '';

  const statusColor =
    phase === 'revealing' ? 'text-[#eab308]' :
    phase === 'rewards' ? 'text-green-500' :
    phase === 'sealed' ? 'text-green-500' : 'text-[#444]';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
      {/* Left: Pool card */}
      <div>
        <p className="text-[11px] text-[#444] font-mono tracking-widest mb-4">LIVE POOL</p>
        <div className="border border-[#1a1a1a] rounded-lg overflow-hidden relative">
          {/* Header */}
          <div className="px-5 py-4 border-b border-[#1a1a1a] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-pixel text-[1.2rem] text-[#ededed] tracking-wider">POOL #{poolNum}</span>
              <motion.span
                key={`${poolNum}-${phase}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`text-[11px] font-mono ${isRevealed ? 'text-[#ededed]' : 'text-green-500'}`}
              >
                {isRevealed ? 'revealed' : 'open'}
              </motion.span>
            </div>
            <span className="font-pixel text-[1rem] text-[#ededed] tracking-wider">$1.00</span>
          </div>

          {/* Agents — fixed height to prevent layout shift */}
          <div className="h-[250px] overflow-hidden">
            <AnimatePresence mode="popLayout">
              {phase !== 'reset' && AGENTS.slice(0, visibleAgents).map((agent, i) => (
                <motion.div
                  key={`${poolNum}-${agent.name}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="border-b border-[#1a1a1a] last:border-b-0"
                >
                  <div className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: agent.color }}
                        animate={showRewards ? { scale: [1, 1.5, 1] } : {}}
                        transition={{ duration: 0.3, delay: i * 0.1 }}
                      />
                      <span className="text-[13px] text-[#ededed] w-[55px]">{agent.name}</span>
                      <span className="text-[11px] font-mono text-[#444]">{agent.deposit}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono tracking-wider hidden sm:inline">
                        <EncryptedText revealed={isRevealed} ticks={agent.ticks} />
                      </span>
                      {showRewards ? (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.1 }}
                          className="text-[10px] font-mono text-green-500 font-medium"
                        >
                          {agent.reward}
                        </motion.span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-yellow-500">
                          <span className="w-1 h-1 rounded-full bg-yellow-500" />
                          sealed
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[#1a1a1a] flex items-center justify-between">
            <span className="text-[11px] font-mono text-[#444]">{visibleAgents}/{AGENTS.length} agents</span>
            <span className={`text-[11px] font-mono ${statusColor}`}>{statusText}</span>
          </div>

          {/* Reveal flash */}
          <AnimatePresence>
            {phase === 'revealing' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.06, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0 bg-green-500 pointer-events-none rounded-lg"
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right: Synced terminal */}
      <div>
        <p className="text-[11px] text-[#444] font-mono tracking-widest mb-4">LIFECYCLE</p>
        <div className="border border-[#1a1a1a] rounded-lg overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#1a1a1a]">
            <div className="w-2 h-2 rounded-full bg-[#333]" />
            <div className="w-2 h-2 rounded-full bg-[#333]" />
            <div className="w-2 h-2 rounded-full bg-[#333]" />
            <span className="ml-2 text-[10px] text-[#333] font-mono">agent-deploy.sh</span>
          </div>
          <div
            ref={termRef}
            className="p-4 font-mono text-[12px] leading-[1.9] h-[320px] overflow-y-auto"
          >
            <AnimatePresence initial={false}>
              {termLines.map((line, i) => (
                <motion.div
                  key={`${poolNum}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ color: line.color }}
                >
                  {line.text}
                </motion.div>
              ))}
            </AnimatePresence>
            {phase !== 'reset' && (
              <span className="inline-block w-2 h-4 bg-[#ededed] cursor-blink ml-1" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
