'use client';

export const dynamic = 'force-dynamic';

import { Header } from '@/components/layout/header';
import { PoolCard } from '@/components/pool/pool-card';
import { usePools } from '@/hooks/use-pools';
import { useWallet } from '@/hooks/use-wallet';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';

export default function DashboardPage() {
  const { authenticated } = useWallet();
  const { data: pools, isLoading, error } = usePools();

  // Auth gate
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Header />
        <main className="max-w-[1400px] mx-auto px-5 pt-32 pb-12">
          <div className="max-w-[400px] mx-auto text-center">
            <h1 className="font-pixel text-[1.5rem] text-[#ededed] tracking-wider mb-3">CONNECT TO ENTER</h1>
            <p className="text-[13px] text-[#666] mb-8">
              Sign in to view live pools and deploy agents into the arena.
            </p>
            <ConnectButton />
          </div>
        </main>
      </div>
    );
  }

  const openPools = pools?.filter((p) => p.status === 'OPEN') ?? [];
  const sealedPools = pools?.filter((p) => p.status === 'READY') ?? [];
  const revealedPools = pools?.filter((p) => p.status === 'REVEALED') ?? [];

  const totalDeposited = pools?.reduce((s, p) => s + parseFloat(p.totalDeposited), 0) ?? 0;
  const totalAgents = pools?.reduce((s, p) => s + p.depositCount, 0) ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Header />
      <main className="max-w-[1400px] mx-auto px-5 pt-20 pb-12">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-px bg-[#1a1a1a] rounded-lg overflow-hidden mb-10">
          <StatCell label="pools" value={pools?.length ?? 0} />
          <StatCell label="agents" value={totalAgents} />
          <StatCell label="deposited" value={`$${totalDeposited.toFixed(2)}`} />
          <StatCell label="bite ops" value={totalAgents * 2} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-pixel text-[1.3rem] text-[#ededed] tracking-wider">STRATEGY POOLS</h1>
            <p className="text-[12px] text-[#444] mt-1 font-mono">sealed-bid competitions on BITE v2</p>
          </div>
          <div className="flex gap-2">
            <Link href="/deploy" className="px-3 py-1.5 text-[12px] text-[#666] border border-[#1a1a1a] rounded-full hover:border-[#333] hover:text-[#ededed] transition-colors">
              deploy
            </Link>
            <Link href="/create" className="px-3 py-1.5 text-[12px] bg-[#ededed] text-[#0a0a0a] font-medium rounded-full hover:bg-white transition-colors">
              create pool
            </Link>
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-24 text-[#444] font-mono text-[13px]">
            loading from chain...
          </div>
        )}

        {error && (
          <div className="text-center py-24 text-red-400 font-mono text-[13px]">
            failed to load pools from chain
          </div>
        )}

        {pools && pools.length === 0 && (
          <div className="text-center py-24 border border-[#1a1a1a] rounded-lg">
            <p className="text-[#444] font-mono text-[13px] mb-4">no pools yet</p>
            <Link href="/create" className="px-4 py-2 bg-[#ededed] text-[#0a0a0a] text-[12px] rounded-full">
              create first pool
            </Link>
          </div>
        )}

        {openPools.length > 0 && (
          <Section title="open" count={openPools.length}>
            {openPools.map((p) => <PoolCard key={p.poolId} pool={p} />)}
          </Section>
        )}

        {sealedPools.length > 0 && (
          <Section title="sealed" count={sealedPools.length}>
            {sealedPools.map((p) => <PoolCard key={p.poolId} pool={p} />)}
          </Section>
        )}

        {revealedPools.length > 0 && (
          <Section title="revealed" count={revealedPools.length}>
            {revealedPools.map((p) => <PoolCard key={p.poolId} pool={p} />)}
          </Section>
        )}
      </main>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[#0a0a0a] p-4">
      <div className="text-[11px] text-[#444] font-mono mb-1">{label}</div>
      <div className="text-[18px] font-medium text-[#ededed]">{value}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-[13px] font-mono text-[#ededed]">{title}</h2>
        <span className="text-[11px] text-[#444] font-mono">{count}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
    </div>
  );
}
