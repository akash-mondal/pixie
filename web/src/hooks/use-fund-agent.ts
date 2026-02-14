'use client';

import { useState, useCallback } from 'react';
import { useExportEvmAccount, useEvmAddress } from '@coinbase/cdp-hooks';
import type { Hex } from 'viem';

type FundStatus = 'idle' | 'exporting' | 'sending' | 'confirming' | 'done' | 'error';

export function useFundAgent() {
  const { exportEvmAccount } = useExportEvmAccount();
  const { evmAddress } = useEvmAddress();
  const [status, setStatus] = useState<FundStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const fund = useCallback(async (agentId: string, agentWalletAddress: string, amount: number) => {
    if (!evmAddress) throw new Error('Wallet not connected');
    setStatus('idle');
    setError(null);
    setTxHash(null);

    try {
      // Step 1: Export private key from CDP wallet
      setStatus('exporting');
      const { privateKey } = await exportEvmAccount({ evmAccount: evmAddress });

      // Step 2: Send to server for execution
      // (SKALE RPC doesn't accept eth_sendRawTransaction from browsers,
      //  so the server executes using the same proven pattern as server-wallet)
      setStatus('sending');
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey,
          to: agentWalletAddress,
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transfer failed');

      const hash = data.txHash as Hex;
      setTxHash(hash);

      // Step 3: Mark agent as funded + ensure sFUEL
      setStatus('confirming');
      await fetch(`/api/agent/${agentId}/fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markOnly: true }),
      }).catch(() => {});

      setStatus('done');
      return hash;
    } catch (err: any) {
      setStatus('error');
      const msg = err.message || 'Fund failed';
      setError(msg);
      throw new Error(msg);
    }
  }, [evmAddress, exportEvmAccount]);

  return {
    fund,
    status,
    error,
    txHash,
    isPending: status !== 'idle' && status !== 'done' && status !== 'error',
  };
}
