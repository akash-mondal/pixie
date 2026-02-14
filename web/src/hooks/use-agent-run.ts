'use client';

import { useState, useCallback } from 'react';
import { useWalletClient } from 'wagmi';
import { biteSandbox } from '@/lib/chain';
import {
  CONTRACT_ADDRESS, USDC_ADDRESS, GAMIFIED_LP_ABI, ERC20_ABI, parseUsdc,
} from '@/lib/contract';

export interface AgentEvent {
  type: 'status' | 'strategy' | 'encrypting' | 'depositing' | 'done' | 'error';
  message: string;
  data?: Record<string, unknown>;
}

export function useAgentRun() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: walletClient } = useWalletClient({ chainId: biteSandbox.id });

  const emit = (event: AgentEvent) => setEvents((prev) => [...prev, event]);

  const run = useCallback(async (poolId: number, agentType: string, depositAmount: number) => {
    setEvents([]);
    setRunning(true);
    setError(null);

    try {
      if (!walletClient) throw new Error('Wallet not connected');

      // 1. Call API route for AI strategy + BITE encryption
      emit({ type: 'status', message: 'Analyzing Algebra Finance pool data...' });

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentType }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Agent API failed');
      }

      const result = await res.json();

      emit({
        type: 'strategy',
        message: `Strategy: ticks [${result.strategy.tickLower.toLocaleString()} — ${result.strategy.tickUpper.toLocaleString()}] lock=${result.strategy.lockDays}d`,
        data: result,
      });

      emit({ type: 'encrypting', message: `BITE encrypted (${result.encrypted.length} bytes)` });

      const wc = walletClient as any;

      // 2. Approve USDC
      emit({ type: 'depositing', message: `Approving $${depositAmount} USDC...` });
      const amount = parseUsdc(depositAmount);

      await wc.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, amount],
        gas: 100000n,
        type: 'legacy',
      });

      // 3. Deposit
      emit({ type: 'depositing', message: `Depositing to Pool #${poolId}...` });

      const encBytes = result.encrypted.startsWith('0x') ? result.encrypted : `0x${result.encrypted}`;

      const txHash = await wc.writeContract({
        address: CONTRACT_ADDRESS,
        abi: GAMIFIED_LP_ABI,
        functionName: 'deposit',
        args: [BigInt(poolId), amount, encBytes as `0x${string}`],
        gas: 500000n,
        type: 'legacy',
      });

      emit({
        type: 'done',
        message: 'Deposit confirmed',
        data: { txHash, agent: result.name, depositAmount },
      });
    } catch (err: any) {
      const msg = err.message || 'Agent run failed';
      emit({ type: 'error', message: msg });
      setError(msg);
    } finally {
      setRunning(false);
    }
  }, [walletClient]);

  return { events, running, error, run };
}
