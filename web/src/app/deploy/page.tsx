'use client';

export const dynamic = 'force-dynamic';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { usePools } from '@/hooks/use-pools';
import { useAgentRun, type AgentEvent } from '@/hooks/use-agent-run';
import { AGENT_TYPES } from '@/lib/constants';

export default function DeployPage() {
  return (
    <Suspense>
      <DeployPageInner />
    </Suspense>
  );
}

function DeployPageInner() {
  const searchParams = useSearchParams();
  const defaultPoolId = searchParams.get('poolId');

  const { data: pools } = usePools();
  const { events, running, error, run } = useAgentRun();

  const [poolId, setPoolId] = useState(defaultPoolId ?? '');
  const [agentType, setAgentType] = useState('');
  const [depositAmount, setDepositAmount] = useState(0.2);

  const openPools = pools?.filter((p) => !p.resolved && p.depositCount < p.maxDepositors) ?? [];

  const handleDeploy = () => {
    if (!poolId || !agentType) return;
    run(Number(poolId), agentType, depositAmount);
  };

  const selectedAgent = AGENT_TYPES.find((a) => a.id === agentType);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Header />
      <main className="max-w-[1400px] mx-auto px-5 pt-20 pb-12">
        <h1 className="font-pixel text-[1.3rem] text-[#ededed] tracking-wider mb-1">DEPLOY AGENT</h1>
        <p className="text-[12px] text-[#444] font-mono mb-8">
          choose an AI agent to compete in a sealed-bid pool
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Configuration */}
          <div className="space-y-5">
            {/* Pool selector */}
            <div>
              <label className="block text-[11px] text-[#444] font-mono mb-1">target pool</label>
              <select
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                className="w-full px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded text-[#ededed] text-[13px] font-mono focus:outline-none focus:border-[#333]"
              >
                <option value="">select a pool...</option>
                {openPools.map((p) => (
                  <option key={p.poolId} value={p.poolId}>
                    #{p.poolId} — ${p.rewardAmount} reward — {p.depositCount}/{p.maxDepositors} agents
                  </option>
                ))}
              </select>
            </div>

            {/* Agent picker */}
            <div>
              <label className="block text-[11px] text-[#444] font-mono mb-2">agent personality</label>
              <div className="space-y-1.5">
                {AGENT_TYPES.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setAgentType(agent.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      agentType === agent.id
                        ? 'border-[#ededed] bg-[#111]'
                        : 'border-[#1a1a1a] hover:border-[#333]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[13px] text-[#ededed]">{agent.name}</span>
                      <div className="flex gap-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 border border-[#1a1a1a] rounded text-[#6b6b6b] font-mono">
                          ai:{agent.aiQuality.toLowerCase()}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 border border-[#1a1a1a] rounded text-[#6b6b6b] font-mono">
                          risk:{agent.risk.toLowerCase()}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#444]">{agent.title} — {agent.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Deposit amount */}
            <div>
              <label className="block text-[11px] text-[#444] font-mono mb-1">deposit (usdc)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value))}
                step={0.01}
                min={0.01}
                className="w-full px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded text-[#ededed] text-[13px] font-mono focus:outline-none focus:border-[#333]"
              />
            </div>

            <button
              onClick={handleDeploy}
              disabled={running || !poolId || !agentType}
              className="w-full py-2.5 bg-[#ededed] text-[#0a0a0a] text-[13px] font-medium rounded hover:bg-white disabled:opacity-50 transition-colors"
            >
              {running ? 'deploying...' : 'deploy agent'}
            </button>
          </div>

          {/* Right: Execution stream */}
          <div className="surface rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1a1a1a] flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${running ? 'bg-yellow-500 animate-pulse' : events.length > 0 ? 'bg-green-500' : 'bg-[#333]'}`} />
              <span className="text-[11px] text-[#444] font-mono">
                {running ? 'running' : events.length > 0 ? 'complete' : 'waiting'}
              </span>
              {selectedAgent && (
                <span className="ml-auto text-[11px] text-[#444] font-mono">{selectedAgent.name}</span>
              )}
            </div>

            <div className="p-4 min-h-[300px] max-h-[500px] overflow-y-auto font-mono text-[12px] leading-[1.8] space-y-0.5">
              {events.length === 0 && !running && (
                <p className="text-[#333]">deploy an agent to see execution...</p>
              )}

              {events.map((event, i) => (
                <EventLine key={i} event={event} />
              ))}

              {error && (
                <div className="text-red-400 mt-2">! {error}</div>
              )}

              {running && (
                <span className="inline-block w-2 h-4 bg-[#ededed] cursor-blink ml-1" />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function EventLine({ event }: { event: AgentEvent }) {
  const colors: Record<string, string> = {
    status: 'text-[#6b6b6b]',
    strategy: 'text-[#ededed]',
    encrypting: 'text-[#eab308]',
    depositing: 'text-[#eab308]',
    done: 'text-[#22c55e]',
    error: 'text-red-400',
  };

  const icons: Record<string, string> = {
    status: '>',
    strategy: '#',
    encrypting: '~',
    depositing: '$',
    done: '+',
    error: '!',
  };

  return (
    <div style={{ color: colors[event.type] ? undefined : '#6b6b6b' }} className={colors[event.type] ?? ''}>
      <span className="text-[#333] mr-2">{icons[event.type] ?? '>'}</span>
      {event.message}
    </div>
  );
}
