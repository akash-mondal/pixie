'use client';

import type { TickEvent } from '@/lib/agent-loop';

interface BiteLifecycleProps {
  events: TickEvent[];
  biteOps: number;
  resolved: boolean;
  timeLeft: number;
  x402Payments?: number;
  x402TotalUsd?: number;
}

interface BiteOp {
  step: string;
  label: string;
  method: string;
  detail: string;
  status: 'done' | 'active' | 'pending';
}

export function BiteLifecycle({ events, biteOps, resolved, timeLeft, x402Payments = 0, x402TotalUsd = 0 }: BiteLifecycleProps) {
  // Count specific operations from events
  const encryptCount = events.filter(e => e.type === 'encrypting').length;
  const executedCount = events.filter(e => e.type === 'executed').length;
  const x402Count = events.filter(e => (e.type as string) === 'x402-purchase').length;

  const steps: BiteOp[] = [
    {
      step: 'ENCRYPT',
      label: 'Strategy encrypted',
      method: 'bite.encryptMessage()',
      detail: encryptCount > 0 ? `${encryptCount} strategies sealed` : 'awaiting agents',
      status: encryptCount > 0 ? 'done' : 'pending',
    },
    {
      step: 'SEAL',
      label: 'Joined arena on-chain',
      method: 'PixieArena.joinArena()',
      detail: encryptCount > 0 ? `encrypted strategies committed` : 'awaiting join',
      status: encryptCount > 0 ? 'done' : 'pending',
    },
    {
      step: 'x402',
      label: 'Agent commerce',
      method: 'x402 EIP-712 → USDC micropayments',
      detail: x402Payments > 0 ? `${x402Payments} purchases ($${x402TotalUsd.toFixed(2)})` : 'agents decide autonomously',
      status: x402Payments > 0 ? 'done' : executedCount > 0 ? 'active' : 'pending',
    },
    {
      step: 'TRADE',
      label: 'Swap calldata encrypted',
      method: 'bite.encryptTransaction()',
      detail: executedCount > 0 ? `${executedCount} encrypted trades` : 'awaiting trades',
      status: executedCount > 0 ? 'done' : 'pending',
    },
    {
      step: 'CONDITION',
      label: 'Arena timer',
      method: `${Math.ceil(timeLeft / 1000)}s remaining`,
      detail: resolved ? 'condition met' : timeLeft > 0 ? 'decrypts when arena ends' : 'timer expired',
      status: resolved ? 'done' : timeLeft > 0 ? 'active' : 'done',
    },
    {
      step: 'REVEAL',
      label: 'Batch decrypt',
      method: 'BITE.submitCTX()',
      detail: resolved ? 'all strategies revealed' : 'waiting for condition',
      status: resolved ? 'done' : 'pending',
    },
    {
      step: 'SETTLE',
      label: 'Results published',
      method: 'PixieArena.finalizeArena()',
      detail: resolved ? 'P&L + rankings on-chain' : 'waiting for reveal',
      status: resolved ? 'done' : 'pending',
    },
  ];

  const statusIcon = (s: BiteOp['status']) =>
    s === 'done' ? '\u25c9' : s === 'active' ? '\u25ce' : '\u25cb';

  const statusColor = (s: BiteOp['status'], step?: string) => {
    if (step === 'x402') {
      return s === 'done' ? 'text-green-400' : s === 'active' ? 'text-green-300' : 'text-[#333]';
    }
    return s === 'done' ? 'text-yellow-500' : s === 'active' ? 'text-cyan-400' : 'text-[#333]';
  };

  return (
    <div className="rounded-lg border border-[#1a1a1a] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
        <span className="text-[12px] text-[#444] font-mono tracking-widest">BITE LIFECYCLE</span>
        <span className="font-pixel text-[16px] text-yellow-500 tracking-wider">{biteOps}</span>
      </div>

      <div className="p-4 space-y-3.5">
        {steps.map((step) => (
          <div key={step.step} className="flex items-start gap-3">
            <span className={`text-[18px] leading-none mt-0.5 ${statusColor(step.status, step.step)}`}>
              {statusIcon(step.status)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[13px] font-mono font-medium ${statusColor(step.status, step.step)}`}>
                  {step.step}
                </span>
                <span className="text-[12px] text-[#444] font-mono">{step.label}</span>
              </div>
              <div className="text-[12px] text-[#555] font-mono truncate">{step.method}</div>
              <div className="text-[11px] text-[#333] font-mono">{step.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
