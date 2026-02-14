'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { decodeEventLog } from 'viem';
import { useWalletClient } from 'wagmi';
import { Header } from '@/components/layout/header';
import { useWallet } from '@/hooks/use-wallet';
import { biteSandbox } from '@/lib/chain';
import {
  CONTRACT_ADDRESS, USDC_ADDRESS, GAMIFIED_LP_ABI, ERC20_ABI, parseUsdc, publicClient,
} from '@/lib/contract';

export default function CreatePoolPage() {
  const router = useRouter();
  const { address } = useWallet();
  const { data: walletClient } = useWalletClient({ chainId: biteSandbox.id });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    rewardAmount: 1.0,
    deadlineMinutes: 10,
    minDepositors: 3,
    maxDepositors: 5,
    minDeposit: 0.1,
    maxDeposit: 1.0,
    gracePeriod: 300,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !walletClient) return;
    setCreating(true);

    try {
      const rewardAmount = parseUsdc(form.rewardAmount);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + form.deadlineMinutes * 60);

      const wc = walletClient as any;

      // Approve USDC for reward
      const approveTx = await wc.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, rewardAmount],
        gas: 100000n,
        type: 'legacy',
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });

      // Create pool
      const createTx = await wc.writeContract({
        address: CONTRACT_ADDRESS,
        abi: GAMIFIED_LP_ABI,
        functionName: 'createPool',
        args: [
          deadline,
          BigInt(form.minDepositors),
          BigInt(form.maxDepositors),
          parseUsdc(form.minDeposit),
          parseUsdc(form.maxDeposit),
          rewardAmount,
          BigInt(form.gracePeriod),
        ],
        gas: 500000n,
        type: 'legacy',
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: createTx });

      // Parse PoolCreated event for poolId
      let poolId = 0;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: GAMIFIED_LP_ABI, data: log.data, topics: log.topics });
          if (decoded.eventName === 'PoolCreated') {
            poolId = Number((decoded.args as any).poolId);
          }
        } catch { /* skip */ }
      }

      router.push(`/pool/${poolId}`);
    } catch (err) {
      console.error('Create pool failed:', err);
      setCreating(false);
    }
  };

  const update = (key: string, value: number) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Header />
      <main className="max-w-[600px] mx-auto px-5 pt-20 pb-12">
        <h1 className="font-pixel text-[1.3rem] text-[#ededed] tracking-wider mb-1">CREATE POOL</h1>
        <p className="text-[12px] text-[#444] font-mono mb-8">
          set up a sealed-bid LP competition
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="reward (usdc)" value={form.rewardAmount} onChange={(v) => update('rewardAmount', v)} step={0.1} min={0.1} />
            <Field label="deadline (min)" value={form.deadlineMinutes} onChange={(v) => update('deadlineMinutes', v)} step={1} min={1} />
            <Field label="min agents" value={form.minDepositors} onChange={(v) => update('minDepositors', v)} step={1} min={1} />
            <Field label="max agents" value={form.maxDepositors} onChange={(v) => update('maxDepositors', v)} step={1} min={1} />
            <Field label="min deposit (usdc)" value={form.minDeposit} onChange={(v) => update('minDeposit', v)} step={0.01} min={0.01} />
            <Field label="max deposit (usdc)" value={form.maxDeposit} onChange={(v) => update('maxDeposit', v)} step={0.01} min={0.01} />
          </div>

          <Field label="grace period (sec)" value={form.gracePeriod} onChange={(v) => update('gracePeriod', v)} step={60} min={0} />

          {/* Preview */}
          <div className="grid grid-cols-2 gap-px bg-[#1a1a1a] rounded-lg overflow-hidden">
            <div className="bg-[#0a0a0a] p-3">
              <div className="text-[10px] text-[#444] font-mono mb-0.5">total reward</div>
              <div className="text-[14px] text-[#ededed] font-medium">${form.rewardAmount.toFixed(2)}</div>
            </div>
            <div className="bg-[#0a0a0a] p-3">
              <div className="text-[10px] text-[#444] font-mono mb-0.5">agents</div>
              <div className="text-[14px] text-[#ededed]">{form.minDepositors}–{form.maxDepositors}</div>
            </div>
            <div className="bg-[#0a0a0a] p-3">
              <div className="text-[10px] text-[#444] font-mono mb-0.5">deposit range</div>
              <div className="text-[14px] text-[#ededed]">${form.minDeposit}–${form.maxDeposit}</div>
            </div>
            <div className="bg-[#0a0a0a] p-3">
              <div className="text-[10px] text-[#444] font-mono mb-0.5">est. payout/agent</div>
              <div className="text-[14px] text-green-500">~${(form.rewardAmount / form.maxDepositors).toFixed(2)}</div>
            </div>
          </div>

          <button
            type="submit"
            disabled={creating || !address}
            className="w-full py-2.5 bg-[#ededed] text-[#0a0a0a] text-[13px] font-medium rounded hover:bg-white disabled:opacity-50 transition-colors"
          >
            {!address ? 'connect wallet first' : creating ? 'creating...' : 'create pool'}
          </button>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
}) {
  return (
    <div>
      <label className="block text-[11px] text-[#444] font-mono mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        min={min}
        className="w-full px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded text-[#ededed] text-[13px] font-mono focus:outline-none focus:border-[#333] transition-colors"
      />
    </div>
  );
}
