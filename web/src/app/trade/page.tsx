'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { useAgents } from '@/hooks/use-agents';
import { useWallet } from '@/hooks/use-wallet';

interface TradeEvent {
  type: string;
  message: string;
}

export default function TradePage() {
  const { data: agents } = useAgents();
  const { address } = useWallet();

  const [selectedAgent, setSelectedAgent] = useState('');
  const [prompt, setPrompt] = useState('');
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [running, setRunning] = useState(false);

  const myAgents = agents?.filter(a => a.owner?.toLowerCase() === address?.toLowerCase()) ?? [];
  const agent = agents?.find(a => a.id === selectedAgent);

  const handleTrade = async () => {
    if (!prompt || !agent || !address) return;
    setRunning(true);
    setEvents([]);

    const emit = (type: string, message: string) =>
      setEvents(prev => [...prev, { type, message }]);

    try {
      emit('status', `Agent ${agent.name} analyzing market...`);

      const res = await fetch('/api/agent/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          agentConfig: agent.config,
          walletAddress: address,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Trade failed');
      }

      const result = await res.json();

      if (result.action === 'hold') {
        emit('hold', `HOLD — ${result.reasoning}`);
      } else {
        emit('decision', `${result.direction.toUpperCase()} ${result.pair} — $${result.amountUsdc} USDC`);
        emit('strategy', result.reasoning);
        emit('encrypting', `bite.encryptTransaction({to: SwapRouter, data: ${result.calldata?.slice(0, 18)}...})`);
        emit('encrypted', `tx encrypted (${result.encrypted?.slice(0, 20)}...)`);
        emit('encrypting', `bite.encryptMessage(reasoning) — ${result.encryptedReasoning?.slice(0, 16)}...`);
        emit('done', `${result.biteOps} BITE operations completed — strategy hidden, trade hidden`);
      }
    } catch (err: any) {
      emit('error', err.message || 'Trade execution failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Header />
      <main className="max-w-[1400px] mx-auto px-5 pt-20 pb-12">
        <h1 className="font-pixel text-[1.3rem] text-[#ededed] tracking-wider mb-1">TRADE</h1>
        <p className="text-[12px] text-[#444] font-mono mb-8">
          natural language → AI strategy → BITE-encrypted execution
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT — Trade input */}
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] text-[#444] font-mono mb-1">agent</label>
              <select
                value={selectedAgent}
                onChange={e => setSelectedAgent(e.target.value)}
                className="w-full px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded text-[#ededed] text-[13px] font-mono focus:outline-none focus:border-[#333]"
              >
                <option value="">select agent...</option>
                {myAgents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {agent && (
              <div className="p-3 rounded border border-[#1a1a1a]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] text-[#ededed]">{agent.name}</span>
                  <span className="text-[10px] font-mono text-yellow-500">encrypted</span>
                </div>
                <div className="text-[11px] text-[#444] font-mono mb-2 truncate">{agent.personality}</div>
                <div className="flex gap-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 border border-[#1a1a1a] rounded font-mono text-[#555]">
                    risk:{agent.config?.riskTolerance}/10
                  </span>
                  {agent.config?.tradingPairs?.map((p: string) => (
                    <span key={p} className="text-[10px] px-1.5 py-0.5 border border-[#1a1a1a] rounded font-mono text-[#555]">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] text-[#444] font-mono mb-1">trade command</label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Buy ETH aggressively with 1 USDC..."
                rows={3}
                className="w-full px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded text-[#ededed] text-[13px] font-mono focus:outline-none focus:border-[#333] placeholder:text-[#222] resize-none transition-colors"
              />
            </div>

            <button
              onClick={handleTrade}
              disabled={running || !selectedAgent || !prompt || !address}
              className="w-full py-2.5 bg-[#ededed] text-[#0a0a0a] text-[13px] font-medium rounded hover:bg-white disabled:opacity-50 transition-colors"
            >
              {!address ? 'connect wallet' : running ? 'executing...' : 'execute trade'}
            </button>
          </div>

          {/* RIGHT — Execution stream */}
          <div className="rounded-lg border border-[#1a1a1a] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1a1a1a] flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${running ? 'bg-yellow-500 animate-pulse' : events.length > 0 ? 'bg-green-500' : 'bg-[#333]'}`} />
              <span className="text-[11px] text-[#444] font-mono">
                {running ? 'executing' : events.length > 0 ? 'complete' : 'waiting'}
              </span>
            </div>
            <div className="p-4 min-h-[300px] max-h-[500px] overflow-y-auto font-mono text-[12px] leading-[1.8] space-y-0.5">
              {events.length === 0 && !running && (
                <p className="text-[#333]">execute a trade to see encrypted output...</p>
              )}
              {events.map((event, i) => {
                const colors: Record<string, string> = {
                  status: 'text-[#6b6b6b]',
                  decision: 'text-[#ededed]',
                  strategy: 'text-[#ededed]',
                  encrypting: 'text-yellow-500',
                  encrypted: 'text-yellow-500',
                  hold: 'text-[#555]',
                  done: 'text-green-500',
                  error: 'text-red-400',
                };
                const icons: Record<string, string> = {
                  status: '>',
                  decision: '#',
                  strategy: '#',
                  encrypting: '~',
                  encrypted: '$',
                  hold: '-',
                  done: '+',
                  error: '!',
                };
                return (
                  <div key={i} className={colors[event.type] ?? 'text-[#6b6b6b]'}>
                    <span className="text-[#333] mr-2">{icons[event.type] ?? '>'}</span>
                    {event.message}
                  </div>
                );
              })}
              {running && <span className="inline-block w-2 h-4 bg-[#ededed] animate-pulse ml-1" />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
