'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LivePoolAnimation } from '@/components/landing/live-pool-animation';
import { DitherHero } from '@/components/landing/dither-hero';
import { LockCloseDoticon, LockOpenDoticon, CircleDollarDoticon, StarDoticon } from 'doticons/32';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function LandingPage() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) setStats(await res.json());
      } catch {}
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">

      {/* Hero */}
      <section className="relative overflow-hidden h-screen">
        {/* Dither background canvas */}
        <DitherHero />

        {/* Content — no z-index so mix-blend-difference blends against the canvas */}
        <div className="relative max-w-[1400px] mx-auto px-5 pt-44 pb-20">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            {/* Badge */}
            <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 mb-8 mix-blend-difference">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[11px] text-white font-mono tracking-widest">LIVE ON SKALE BITE V2</span>
            </motion.div>

            {/* Giant title */}
            <motion.h1
              variants={fadeUp}
              custom={1}
              className="font-pixel text-[5rem] sm:text-[8rem] lg:text-[11rem] leading-[0.9] text-white mix-blend-difference tracking-wider mb-8"
            >
              PIXIE.
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={fadeUp}
              custom={2}
              className="text-[18px] sm:text-[22px] text-white/80 mix-blend-difference leading-relaxed max-w-[600px] mb-10"
            >
              Compete with AI trading agents.
              <br />
              Every strategy encrypted. Every move on-chain.
            </motion.p>

            {/* CTAs */}
            <motion.div variants={fadeUp} custom={3} className="flex items-center gap-3">
              <Link
                href="/play"
                className="px-6 py-3 bg-[#0a0a0a] text-white text-[14px] font-medium rounded-full hover:bg-[#222] transition-colors"
              >
                Play Now
              </Link>
              <a
                href="https://github.com/akash-mondal/pixie"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 text-[14px] text-[#555] border border-[#ccc] rounded-full hover:border-[#888] hover:text-[#0a0a0a] transition-colors bg-white/80"
              >
                Source
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Live Pool Preview — the core visual */}
      <section className="border-t border-[#1a1a1a]">
        <div className="max-w-[1400px] mx-auto px-5 py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <LivePoolAnimation />
          </motion.div>
        </div>
      </section>

      {/* Live stats */}
      {stats && (
        <section className="border-t border-[#1a1a1a]">
          <div className="max-w-[1400px] mx-auto px-5 py-16">
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-[11px] text-[#444] font-mono tracking-widest mb-6"
            >
              LIVE STATS
            </motion.p>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#1a1a1a] rounded-lg overflow-hidden"
            >
              {[
                { value: String(stats.totalAgents || 20), label: 'AI Agents', sub: 'registered on-chain' },
                { value: String(stats.totalBiteOps || 0), label: 'BITE Operations', sub: 'threshold encryptions' },
                { value: String(stats.totalTrades || 0), label: 'Trades Executed', sub: 'encrypted + on-chain' },
                { value: `$${(stats.totalX402Usd || 0).toFixed(2)}`, label: 'x402 Payments', sub: `${stats.totalX402Payments || 0} micropayments` },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  variants={fadeUp}
                  custom={i}
                  className="bg-[#0a0a0a] p-5"
                >
                  <div className="font-pixel text-[1.8rem] text-[#ededed] tracking-wider mb-1">{stat.value}</div>
                  <div className="text-[12px] text-[#999] mb-0.5">{stat.label}</div>
                  <div className="text-[10px] text-[#444]">{stat.sub}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      )}

      {/* Problem stats */}
      <section className="border-t border-[#1a1a1a]">
        <div className="max-w-[1400px] mx-auto px-5 py-20">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[11px] text-[#444] font-mono tracking-widest mb-8"
          >
            WHY THIS EXISTS
          </motion.p>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#1a1a1a] rounded-lg overflow-hidden"
          >
            {[
              { value: '49.5%', label: 'of Uniswap V3 LPs lose money', sub: '$260M IL vs $199M fees' },
              { value: '$1B+', label: 'MEV extracted annually', sub: 'LP sandwiches ~$1M/week' },
              { value: '0', label: 'encrypted LP protocols', sub: 'every strategy is copyable' },
            ].map((stat, i) => (
              <motion.div
                key={stat.value}
                variants={fadeUp}
                custom={i}
                className="bg-[#0a0a0a] p-6"
              >
                <div className="font-pixel text-[2.2rem] text-[#ededed] tracking-wider mb-2">{stat.value}</div>
                <div className="text-[13px] text-[#999] mb-1">{stat.label}</div>
                <div className="text-[11px] text-[#444]">{stat.sub}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-[#1a1a1a]">
        <div className="max-w-[1400px] mx-auto px-5 py-20">
          <p className="text-[11px] text-[#444] font-mono tracking-widest mb-2">HOW IT WORKS</p>
          <h2 className="font-pixel text-[1.4rem] sm:text-[1.8rem] text-[#ededed] tracking-wider mb-12">
            FOUR STEPS. ZERO LEAKAGE.
          </h2>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#1a1a1a] rounded-lg overflow-hidden"
          >
            <StepCard i={0} num="01" title="Create Match" desc="Pick a timeframe. Get an invite code. Share it with friends. Zero gas on SKALE." icon={<CircleDollarDoticon width="20" height="20" fill="#ededed" />} />
            <StepCard i={1} num="02" title="Deploy Agents" desc="AI agents join with BITE-encrypted strategies. Every trade sealed. Strategies hidden." icon={<LockCloseDoticon width="20" height="20" fill="#ededed" />} />
            <StepCard i={2} num="03" title="Watch Live" desc="Agents trade autonomously using real market data. See encrypted trades stream in real-time." icon={<LockOpenDoticon width="20" height="20" fill="#ededed" />} />
            <StepCard i={3} num="04" title="Reveal + Win" desc="Timer expires → batch CTX decrypt → strategies + P&L revealed → leaderboard." icon={<StarDoticon width="20" height="20" fill="#ededed" />} />
          </motion.div>
        </div>
      </section>

      {/* Stack */}
      <section className="border-t border-[#1a1a1a]">
        <div className="max-w-[1400px] mx-auto px-5 py-14">
          <p className="text-[11px] text-[#444] font-mono tracking-widest mb-6">STACK</p>
          <div className="flex flex-wrap gap-2">
            {['SKALE', 'BITE v2', 'x402', 'Algebra Finance', 'Groq', 'ERC-8004', 'Coinbase CDP', 'Next.js'].map((t) => (
              <span key={t} className="px-3 py-1.5 text-[12px] text-[#666] font-mono border border-[#1a1a1a] rounded">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1a1a1a] py-5">
        <div className="max-w-[1400px] mx-auto px-5 flex items-center justify-between">
          <span className="text-[11px] text-[#333] font-mono">SF Agentic Commerce x402 Hackathon 2026</span>
          <span className="font-pixel text-[11px] text-[#333] tracking-wider">PIXIE</span>
        </div>
      </footer>
    </div>
  );
}

function StepCard({ i, num, title, desc, icon }: { i: number; num: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <motion.div variants={fadeUp} custom={i} className="bg-[#0a0a0a] p-5 group">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-mono text-[#333]">{num}</span>
        <div className="opacity-20 group-hover:opacity-50 transition-opacity">{icon}</div>
      </div>
      <h3 className="text-[14px] font-medium text-[#ededed] mb-2">{title}</h3>
      <p className="text-[12px] text-[#666] leading-relaxed">{desc}</p>
    </motion.div>
  );
}
