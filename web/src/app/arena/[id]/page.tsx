'use client';

export const dynamic = 'force-dynamic';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/header';
import { useArena, useJoinArena, useResolveArena } from '@/hooks/use-arena';
import { useArenaStream } from '@/hooks/use-arena-stream';
import { useAgents } from '@/hooks/use-agents';
import { useWallet } from '@/hooks/use-wallet';
import type { TickEvent } from '@/lib/agent-loop';

export default function ArenaDetailPage() {
  const params = useParams();
  const arenaId = params.id as string;
  const { data: arena, isLoading } = useArena(arenaId);
  const { events, connected } = useArenaStream(arenaId);
  const { data: agents } = useAgents();
  const { address } = useWallet();
  const joinArena = useJoinArena();
  const resolveArena = useResolveArena();

  const [selectedAgent, setSelectedAgent] = useState('');
  const [depositAmount, setDepositAmount] = useState(10);
  const [leaderboard, setLeaderboard] = useState<any[] | null>(null);

  const myAgents = agents?.filter(a => a.owner?.toLowerCase() === address?.toLowerCase()) ?? [];
  const isActive = arena && !arena.resolved && Date.now() < arena.deadline;
  const canJoin = isActive && arena && (arena.entries?.length || 0) < arena.maxAgents;

  const handleJoin = async () => {
    if (!address || !selectedAgent || !arenaId) return;
    await joinArena.mutateAsync({
      arenaId,
      agentId: selectedAgent,
      walletAddress: address,
      depositAmount,
    });
  };

  const handleResolve = async () => {
    if (!arenaId) return;
    const result = await resolveArena.mutateAsync(arenaId);
    if (result.leaderboard) setLeaderboard(result.leaderboard);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Header />
        <div className="max-w-[1400px] mx-auto px-5 pt-20 text-center text-[#444] font-mono text-[13px]">
          loading arena...
        </div>
      </div>
    );
  }

  if (!arena) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Header />
        <div className="max-w-[1400px] mx-auto px-5 pt-20 text-center text-red-400 font-mono text-[13px]">
          arena not found
        </div>
      </div>
    );
  }

  const timeLeft = Math.max(0, arena.deadline - Date.now());
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Header />
      <main className="max-w-[1400px] mx-auto px-5 pt-20 pb-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-pixel text-[1.3rem] text-[#ededed] tracking-wider">ARENA #{arenaId}</h1>
              <span className={`text-[11px] font-mono ${isActive ? 'text-green-500' : arena.resolved ? 'text-[#ededed]' : 'text-[#444]'}`}>
                {isActive ? 'live' : arena.resolved ? 'revealed' : 'ended'}
              </span>
              {connected && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-yellow-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                  streaming
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#444] font-mono">
              {arena.creator?.slice(0, 8)}...{arena.creator?.slice(-4)}
            </p>
          </div>
          <div className="flex gap-2">
            {isActive && arena.entries && arena.entries.length > 0 && (
              <button
                onClick={handleResolve}
                disabled={resolveArena.isPending}
                className="px-3 py-1.5 text-[12px] bg-[#ededed] text-[#0a0a0a] font-medium rounded hover:bg-white disabled:opacity-50 transition-colors"
              >
                {resolveArena.isPending ? 'resolving...' : 'trigger reveal'}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-px bg-[#1a1a1a] rounded-lg overflow-hidden mb-6">
          <StatBlock label="prize" value={`$${arena.prizePool}`} />
          <StatBlock label="agents" value={`${arena.entries?.length || 0}/${arena.maxAgents}`} />
          <StatBlock label="trades" value={String(arena.totalTrades || 0)} />
          <StatBlock label="BITE ops" value={String(arena.biteOps || 0)} color="text-yellow-500" />
          <StatBlock
            label="time"
            value={isActive ? `${minutes}:${seconds.toString().padStart(2, '0')}` : arena.resolved ? 'revealed' : 'ended'}
            color={isActive ? 'text-green-500' : undefined}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
          {/* LEFT — Trade Feed */}
          <div>
            <div className="rounded-lg border border-[#1a1a1a] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1a1a1a] flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-yellow-500 animate-pulse' : events.length > 0 ? 'bg-green-500' : 'bg-[#333]'}`} />
                <span className="text-[11px] text-[#444] font-mono">
                  {connected ? 'live feed' : events.length > 0 ? 'complete' : 'waiting for agents'}
                </span>
                <span className="ml-auto text-[10px] text-[#333] font-mono">
                  {events.length} events
                </span>
              </div>

              <div className="p-4 min-h-[400px] max-h-[600px] overflow-y-auto font-mono text-[12px] leading-[1.8] space-y-0.5">
                {events.length === 0 && !connected && (
                  <p className="text-[#333]">join an agent to see live trading...</p>
                )}

                {events.map((event, i) => (
                  <EventLine key={i} event={event} />
                ))}

                {connected && (
                  <span className="inline-block w-2 h-4 bg-[#ededed] animate-pulse ml-1" />
                )}
              </div>
            </div>

            {/* Leaderboard */}
            {(leaderboard || arena.resolved) && (
              <div className="mt-6 rounded-lg border border-[#1a1a1a] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#1a1a1a]">
                  <span className="text-[11px] text-[#444] font-mono tracking-widest">LEADERBOARD</span>
                </div>
                <div className="divide-y divide-[#1a1a1a]">
                  {(leaderboard || arena.entries || []).map((entry: any, i: number) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-[14px] font-pixel tracking-wider ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-[#999]' : i === 2 ? 'text-orange-600' : 'text-[#444]'}`}>
                          #{entry.rank || i + 1}
                        </span>
                        <div>
                          <div className="text-[13px] text-[#ededed]">{entry.agentName}</div>
                          <div className="text-[10px] text-[#444] font-mono">{entry.tradeCount} trades</div>
                        </div>
                      </div>
                      <span className={`text-[14px] font-mono ${(entry.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                        {(entry.pnl || 0) >= 0 ? '+' : ''}{((entry.pnl || 0) / 100).toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — Join + Agents */}
          <div className="space-y-4">
            {/* Join panel */}
            {canJoin && (
              <div className="rounded-lg border border-[#1a1a1a] p-4">
                <div className="text-[10px] text-[#444] font-mono tracking-widest mb-3">JOIN ARENA</div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-[#444] font-mono mb-1">your agent</label>
                    <select
                      value={selectedAgent}
                      onChange={e => setSelectedAgent(e.target.value)}
                      className="w-full px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded text-[#ededed] text-[13px] font-mono focus:outline-none focus:border-[#333]"
                    >
                      <option value="">select agent...</option>
                      {myAgents.map(a => (
                        <option key={a.id} value={a.id}>{a.name} (risk {a.config?.riskTolerance}/10)</option>
                      ))}
                    </select>
                    {myAgents.length === 0 && (
                      <p className="text-[10px] text-[#333] font-mono mt-1">
                        no agents — create one on /agents first
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#444] font-mono mb-1">starting USDC</label>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={e => setDepositAmount(Number(e.target.value))}
                      min={1}
                      step={1}
                      className="w-full px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded text-[#ededed] text-[13px] font-mono focus:outline-none focus:border-[#333]"
                    />
                  </div>
                  <button
                    onClick={handleJoin}
                    disabled={joinArena.isPending || !selectedAgent || !address}
                    className="w-full py-2.5 bg-[#ededed] text-[#0a0a0a] text-[13px] font-medium rounded hover:bg-white disabled:opacity-50 transition-colors"
                  >
                    {joinArena.isPending ? 'joining...' : 'deploy agent'}
                  </button>
                </div>
              </div>
            )}

            {/* Entries */}
            <div className="rounded-lg border border-[#1a1a1a] p-4">
              <div className="text-[10px] text-[#444] font-mono tracking-widest mb-3">AGENTS ({arena.entries?.length || 0})</div>
              {(!arena.entries || arena.entries.length === 0) ? (
                <div className="text-[12px] text-[#333] font-mono">no agents joined yet</div>
              ) : (
                <div className="space-y-2">
                  {arena.entries.map((entry: any, i: number) => (
                    <div key={i} className="p-3 rounded border border-[#1a1a1a]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] text-[#ededed]">{entry.agentName}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-yellow-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                          encrypted
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-[#444]">
                        <span>{entry.tradeCount} trades</span>
                        {entry.revealed && (
                          <span className={`${(entry.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                            {(entry.pnl || 0) >= 0 ? '+' : ''}{((entry.pnl || 0) / 100).toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* BITE ops counter */}
            <div className="rounded-lg border border-[#1a1a1a] p-4">
              <div className="text-[10px] text-[#444] font-mono tracking-widest mb-2">BITE OPERATIONS</div>
              <div className="font-pixel text-[2rem] text-yellow-500 tracking-wider">
                {arena.biteOps || 0}
              </div>
              <div className="text-[10px] text-[#333] font-mono">
                threshold encryptions this arena
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatBlock({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[#0a0a0a] p-4">
      <div className="text-[10px] text-[#444] font-mono mb-1">{label}</div>
      <div className={`text-[16px] font-medium ${color || 'text-[#ededed]'}`}>{value}</div>
    </div>
  );
}

function EventLine({ event }: { event: TickEvent }) {
  const colors: Record<string, string> = {
    analyzing: 'text-[#6b6b6b]',
    decision: 'text-[#ededed]',
    encrypting: 'text-yellow-500',
    executed: 'text-yellow-500',
    hold: 'text-[#555]',
    stop: 'text-red-400',
    error: 'text-red-400',
    done: 'text-green-500',
  };

  const icons: Record<string, string> = {
    analyzing: '>',
    decision: '#',
    encrypting: '~',
    executed: '$',
    hold: '-',
    stop: '!',
    error: '!',
    done: '+',
  };

  const prefix = event.agentName ? `[${event.agentName}] ` : '';

  return (
    <div className={colors[event.type] ?? 'text-[#6b6b6b]'}>
      <span className="text-[#333] mr-2">{icons[event.type] ?? '>'}</span>
      <span className="text-[#444]">{prefix}</span>
      {event.message}
    </div>
  );
}
