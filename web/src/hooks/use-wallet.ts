'use client';

import { useEffect, useRef } from 'react';
import { useIsSignedIn, useEvmAddress } from '@coinbase/cdp-hooks';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { biteSandbox } from '@/lib/chain';

const USDC_ADDRESS = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as const;
const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export function useWallet() {
  const { isSignedIn } = useIsSignedIn();
  const { evmAddress } = useEvmAddress();
  const sfuelRequested = useRef<string | null>(null);

  const { data: usdcRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: evmAddress ? [evmAddress as `0x${string}`] : undefined,
    chainId: biteSandbox.id,
    query: { enabled: !!evmAddress, refetchInterval: 15000 },
  });

  // Auto-send sFUEL to new users on sign-in
  useEffect(() => {
    if (!isSignedIn || !evmAddress) return;
    if (sfuelRequested.current === evmAddress) return;
    sfuelRequested.current = evmAddress;

    fetch('/api/sfuel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: evmAddress }),
    }).catch(() => {}); // fire-and-forget
  }, [isSignedIn, evmAddress]);

  const usdcBalance = usdcRaw !== undefined ? formatUnits(usdcRaw, 6) : null;

  return {
    authenticated: isSignedIn,
    address: evmAddress ?? null,
    usdcBalance,
    walletClient: null,
  };
}
