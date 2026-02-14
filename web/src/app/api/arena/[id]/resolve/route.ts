// POST /api/arena/[id]/resolve — Trigger on-chain finalize with BITE CTX batch reveal (REAL)

import { NextRequest, NextResponse } from 'next/server';
import { parseEther } from 'viem';
import { writeServerContract, waitForTx } from '@/lib/server-wallet';
import { ARENA_ADDRESS, PIXIE_ARENA_ABI } from '@/lib/arena';
import { getArenaStore } from '@/lib/arena-store';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: arenaId } = await params;
    const arenaStore = getArenaStore();
    const arena = arenaStore.get(arenaId);

    if (!arena) {
      return NextResponse.json({ error: 'Arena not found' }, { status: 404 });
    }

    if (arena.resolved) {
      return NextResponse.json({ error: 'Already resolved' }, { status: 400 });
    }

    // 1. Stop all agent loops
    arena.activeLoops.clear();

    // 2. Call finalizeArena on-chain (triggers BITE.submitCTX — REAL CTX!)
    let finalizeTxHash: string | undefined;
    try {
      console.log(`[arena/resolve] Calling finalizeArena(${arena.onChainId}) on-chain...`);
      const txHash = await writeServerContract({
        address: ARENA_ADDRESS,
        abi: PIXIE_ARENA_ABI,
        functionName: 'finalizeArena',
        args: [BigInt(arena.onChainId)],
        value: parseEther('0.001'), // sFUEL for CTX callback gas
        gas: 2000000n,
      });
      await waitForTx(txHash);
      finalizeTxHash = txHash;
      console.log(`[arena/resolve] Arena #${arena.onChainId} finalized on-chain, tx: ${txHash}`);
    } catch (err: any) {
      console.error('finalizeArena on-chain failed:', err.message);
      // Continue with server-side resolve even if on-chain CTX fails
    }

    // 3. Mark as resolved
    arenaStore.resolve(arenaId);

    // 4. Reveal all entries
    for (const entry of arena.entries) {
      entry.revealed = true;
    }

    // 5. Build leaderboard
    const leaderboard = [...arena.entries]
      .sort((a, b) => b.pnl - a.pnl)
      .map((entry, rank) => ({
        rank: rank + 1,
        agentName: entry.agentName,
        agentId: entry.agentId,
        owner: entry.owner,
        tradeCount: entry.tradeCount,
        pnl: entry.pnl,
        pnlPercent: (entry.pnl / 100).toFixed(2),
      }));

    return NextResponse.json({
      resolved: true,
      arenaId,
      finalizeTxHash,
      leaderboard,
      totalTrades: arena.totalTrades,
      biteOps: arena.biteOps,
      onChain: !!finalizeTxHash,
    });
  } catch (err: any) {
    console.error('Arena resolve error:', err);
    return NextResponse.json({ error: err.message || 'Resolve failed' }, { status: 500 });
  }
}
