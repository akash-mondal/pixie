'use client';

export const dynamic = 'force-dynamic';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { parseEther } from 'viem';
import { useWalletClient } from 'wagmi';
import { Header } from '@/components/layout/header';
import { DepositTable } from '@/components/pool/deposit-table';
import { StrategyViz } from '@/components/pool/strategy-viz';
import { PoolTimer } from '@/components/pool/pool-timer';
import { usePool } from '@/hooks/use-pools';
import { useWallet } from '@/hooks/use-wallet';
import { POOL_STATUS } from '@/lib/constants';
import { biteSandbox } from '@/lib/chain';
import { CONTRACT_ADDRESS, GAMIFIED_LP_ABI, publicClient } from '@/lib/contract';
import Link from 'next/link';

export default function PoolDetailPage() {
  const params = useParams();
  const poolId = Number(params.id);
  const { data, isLoading, error } = usePool(poolId);
  const { address } = useWallet();
  const { data: walletClient } = useWalletClient({ chainId: biteSandbox.id });
  const [resolving, setResolving] = useState(false);
  const [resolveTx, setResolveTx] = useState<string | null>(null);

  const handleResolve = async () => {
    if (!address || !walletClient) return;
    setResolving(true);
    try {
      const txHash = await (walletClient as any).writeContract({
        address: CONTRACT_ADDRESS,
        abi: GAMIFIED_LP_ABI,
        functionName: 'resolve',
        args: [BigInt(poolId)],
        gas: 2000000n,
        value: parseEther('0.001'),
        type: 'legacy',
      });

      setResolveTx(txHash);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
    } catch (err) {
      console.error('Resolve failed:', err);
    } finally {
      setResolving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Header />
        <div className="max-w-[1400px] mx-auto px-5 pt-20 text-center text-[#444] font-mono text-[13px]">
          loading from chain...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Header />
        <div className="max-w-[1400px] mx-auto px-5 pt-20 text-center text-red-400 font-mono text-[13px]">
          pool not found
        </div>
      </div>
    );
  }

  const { pool, deposits } = data;
  const status = POOL_STATUS[pool.status] ?? POOL_STATUS.OPEN;
  const canResolve = !pool.resolved && pool.depositCount >= pool.minDepositors;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Header />
      <main className="max-w-[1400px] mx-auto px-5 pt-20 pb-12">
        {/* Pool header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-pixel text-[1.5rem] text-[#ededed] tracking-wider">POOL #{pool.poolId}</h1>
              <span className={`text-[11px] font-mono ${status.color}`}>{status.label}</span>
            </div>
            <p className="text-[12px] text-[#444] font-mono">
              {pool.creator.slice(0, 8)}...{pool.creator.slice(-6)}
            </p>
          </div>
          <div className="flex gap-2">
            {canResolve && (
              <button
                onClick={handleResolve}
                disabled={resolving || !address}
                className="px-3 py-1.5 text-[12px] bg-[#ededed] text-[#0a0a0a] font-medium rounded hover:bg-white disabled:opacity-50 transition-colors"
              >
                {resolving ? 'resolving...' : 'trigger reveal'}
              </button>
            )}
            {!pool.resolved && pool.depositCount < pool.maxDepositors && (
              <Link
                href={`/deploy?poolId=${pool.poolId}`}
                className="px-3 py-1.5 text-[12px] text-[#6b6b6b] border border-[#1a1a1a] rounded hover:border-[#333] hover:text-[#ededed] transition-colors"
              >
                deploy agent
              </Link>
            )}
          </div>
        </div>

        {resolveTx && (
          <div className="mb-6 p-3 rounded-lg surface text-[12px] font-mono text-green-500">
            reveal triggered — tx:{' '}
            <a
              href={`https://bite-v2-sandbox-2.explorer.skalenodes.com/tx/${resolveTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {resolveTx.slice(0, 10)}...
            </a>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-px bg-[#1a1a1a] rounded-lg overflow-hidden mb-8">
          <div className="bg-[#0a0a0a] p-4">
            <div className="text-[11px] text-[#444] font-mono mb-1">reward</div>
            <div className="text-[18px] font-medium text-[#ededed]">${pool.rewardAmount}</div>
          </div>
          <div className="bg-[#0a0a0a] p-4">
            <div className="text-[11px] text-[#444] font-mono mb-1">agents</div>
            <div className="text-[18px] font-medium text-[#ededed]">{pool.depositCount}/{pool.maxDepositors}</div>
          </div>
          <div className="bg-[#0a0a0a] p-4">
            <div className="text-[11px] text-[#444] font-mono mb-1">deposited</div>
            <div className="text-[18px] font-medium text-[#ededed]">${pool.totalDeposited}</div>
          </div>
          <div className="bg-[#0a0a0a] p-4">
            <div className="text-[11px] text-[#444] font-mono mb-1">deadline</div>
            <div className="text-[18px] font-medium">
              {pool.resolved ? (
                <span className="text-green-500 text-[13px] font-mono">resolved</span>
              ) : (
                <PoolTimer deadline={pool.depositDeadline} />
              )}
            </div>
          </div>
        </div>

        {/* Strategy visualization */}
        <div className="mb-8">
          <StrategyViz deposits={deposits} />
        </div>

        {/* Deposit table */}
        <div className="surface rounded-lg p-5">
          <div className="text-[11px] text-[#444] font-mono mb-4">deposits</div>
          <DepositTable deposits={deposits} />
        </div>
      </main>
    </div>
  );
}
