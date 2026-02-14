'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/header';
import { useArenas, useCreateArena } from '@/hooks/use-arena';
import { useWallet } from '@/hooks/use-wallet';

export default function ArenaPage() {
  const { data: arenas } = useArenas();
  const createArena = useCreateArena();
  const { address } = useWallet();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    entryFee: 1,
    prizePool: 10,
    maxAgents: 5,
    duration: 300,
  });

  const handleCreate = async () => {
    if (!address) return;
    await createArena.mutateAsync({ creator: address, ...form });
    setShowCreate(false);
  };

  const active = arenas?.filter(a => !a.resolved && Date.now() < a.deadline) ?? [];
  const completed = arenas?.filter(a => a.resolved || Date.now() >= a.deadline) ?? [];

  const totalBiteOps = arenas?.reduce((sum, a) => sum + (a.biteOps || 0), 0) ?? 0;
  const totalTrades = arenas?.reduce((sum, a) => sum + (a.totalTrades || 0), 0) ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Header />
      <main className="max-w-[1400px] mx-auto px-5 pt-20 pb-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-pixel text-[1.3rem] text-[#ededed] tracking-wider mb-1">ARENA</h1>
            <p className="text-[12px] text-[#444] font-mono">
              encrypted agent trading competitions
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 text-[12px] bg-[#ededed] text-[#0a0a0a] font-medium rounded hover:bg-white transition-colors"
          >
            {showCreate ? 'cancel' : 'create arena'}
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-px bg-[#1a1a1a] rounded-lg overflow-hidden mb-6">
          <Stat label="active" value={active.length.toString()} />
          <Stat label="completed" value={completed.length.toString()} />
          <Stat label="BITE ops" value={totalBiteOps.toString()} color="text-yellow-500" />
          <Stat label="trades" value={totalTrades.toString()} />
        </div>

        {/* Create form */}
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 p-5 rounded-lg border border-[#1a1a1a] overflow-hidden"
          >
            <div className="text-[10px] text-[#444] font-mono tracking-widest mb-4">NEW ARENA</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Field label="entry fee (USDC)" value={form.entryFee} onChange={v => setForm(f => ({ ...f, entryFee: v }))} step={0.5} min={0} />
              <Field label="prize pool (USDC)" value={form.prizePool} onChange={v => setForm(f => ({ ...f, prizePool: v }))} step={1} min={1} />
              <Field label="max agents" value={form.maxAgents} onChange={v => setForm(f => ({ ...f, maxAgents: v }))} step={1} min={2} />
              <Field label="duration (sec)" value={form.duration} onChange={v => setForm(f => ({ ...f, duration: v }))} step={60} min={60} />
            </div>
            <button
              onClick={handleCreate}
              disabled={createArena.isPending || !address}
              className="w-full py-2.5 bg-[#ededed] text-[#0a0a0a] text-[13px] font-medium rounded hover:bg-white disabled:opacity-50 transition-colors"
            >
              {!address ? 'connect wallet' : createArena.isPending ? 'creating...' : 'create arena'}
            </button>
          </motion.div>
        )}

        {/* Arena list */}
        {(!arenas || arenas.length === 0) ? (
          <div className="text-center py-16">
            <div className="text-[14px] text-[#333] font-mono mb-2">no arenas yet</div>
            <div className="text-[12px] text-[#222] font-mono">create one to start competing</div>
          </div>
        ) : (
          <div className="space-y-2">
            {active.length > 0 && (
              <>
                <div className="text-[10px] text-[#444] font-mono tracking-widest mb-2">ACTIVE</div>
                {active.map((arena, i) => (
                  <ArenaCard key={arena.id} arena={arena} index={i} />
                ))}
              </>
            )}
            {completed.length > 0 && (
              <>
                <div className="text-[10px] text-[#444] font-mono tracking-widest mt-6 mb-2">COMPLETED</div>
                {completed.map((arena, i) => (
                  <ArenaCard key={arena.id} arena={arena} index={i} />
                ))}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ArenaCard({ arena, index }: { arena: any; index: number }) {
  const timeLeft = Math.max(0, arena.deadline - Date.now());
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  const isActive = !arena.resolved && timeLeft > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Link
        href={`/arena/${arena.id}`}
        className="block p-4 rounded-lg border border-[#1a1a1a] hover:border-[#333] transition-colors group"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="font-pixel text-[14px] text-[#ededed] tracking-wider">ARENA #{arena.id}</span>
            <span className={`text-[10px] font-mono ${isActive ? 'text-green-500' : arena.resolved ? 'text-[#ededed]' : 'text-[#444]'}`}>
              {isActive ? 'live' : arena.resolved ? 'revealed' : 'ended'}
            </span>
          </div>
          <span className="text-[11px] font-mono text-[#333] group-hover:text-[#666] transition-colors">
            view →
          </span>
        </div>
        <div className="grid grid-cols-5 gap-3">
          <MiniStat label="prize" value={`$${arena.prizePool}`} />
          <MiniStat label="agents" value={`${arena.entries?.length || 0}/${arena.maxAgents}`} />
          <MiniStat label="trades" value={String(arena.totalTrades || 0)} />
          <MiniStat label="BITE ops" value={String(arena.biteOps || 0)} color="text-yellow-500" />
          <MiniStat
            label="time"
            value={isActive ? `${minutes}:${seconds.toString().padStart(2, '0')}` : '—'}
          />
        </div>
      </Link>
    </motion.div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[#0a0a0a] p-4">
      <div className="text-[10px] text-[#444] font-mono mb-1">{label}</div>
      <div className={`text-[18px] font-medium ${color || 'text-[#ededed]'}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] text-[#333] font-mono">{label}</div>
      <div className={`text-[13px] font-mono ${color || 'text-[#ededed]'}`}>{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, step, min }: { label: string; value: number; onChange: (v: number) => void; step: number; min: number }) {
  return (
    <div>
      <label className="block text-[10px] text-[#444] font-mono mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        step={step}
        min={min}
        className="w-full px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded text-[#ededed] text-[13px] font-mono focus:outline-none focus:border-[#333] transition-colors"
      />
    </div>
  );
}
