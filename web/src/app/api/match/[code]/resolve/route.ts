// POST /api/match/[code]/resolve — Trigger reveal by invite code (REAL on-chain)

import { NextRequest, NextResponse } from 'next/server';
import { parseEther } from 'viem';
import { writeServerContract, waitForTx } from '@/lib/server-wallet';
import { ARENA_ADDRESS, PIXIE_ARENA_ABI } from '@/lib/arena';
import { getMatchByCode } from '@/lib/match-store';
import { getArenaStore } from '@/lib/arena-store';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const arena = getMatchByCode(code);

    if (!arena) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    if (arena.resolved) {
      // Return leaderboard if already resolved
      const leaderboard = [...arena.entries]
        .sort((a, b) => b.pnl - a.pnl)
        .map((entry, rank) => ({
          rank: rank + 1,
          agentName: entry.agentName,
          agentId: entry.agentId,
          tradeCount: entry.tradeCount,
          pnl: entry.pnl,
          pnlPercent: (entry.pnl / 100).toFixed(2),
        }));

      return NextResponse.json({
        resolved: true,
        alreadyResolved: true,
        leaderboard,
      });
    }

    // 1. Stop all agent loops
    arena.activeLoops.clear();

    // 2. Call finalizeArena on-chain (BITE CTX)
    let finalizeTxHash: string | undefined;
    try {
      console.log(`[match/resolve] Calling finalizeArena(${arena.onChainId}) on-chain...`);
      const txHash = await writeServerContract({
        address: ARENA_ADDRESS,
        abi: PIXIE_ARENA_ABI,
        functionName: 'finalizeArena',
        args: [BigInt(arena.onChainId)],
        value: parseEther('0.001'),
        gas: 2000000n,
      });
      await waitForTx(txHash);
      finalizeTxHash = txHash;
      console.log(`[match/resolve] Match ${code} finalized, tx: ${txHash}`);
    } catch (err: any) {
      console.error('finalizeArena failed:', err.message);
    }

    // 3. Mark as resolved
    const arenaStore = getArenaStore();
    arenaStore.resolve(arena.id);

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
        tradeCount: entry.tradeCount,
        pnl: entry.pnl,
        pnlPercent: (entry.pnl / 100).toFixed(2),
      }));

    return NextResponse.json({
      resolved: true,
      matchCode: code,
      finalizeTxHash,
      leaderboard,
      totalTrades: arena.totalTrades,
      biteOps: arena.biteOps,
      onChain: !!finalizeTxHash,
    });
  } catch (err: any) {
    console.error('Match resolve error:', err);
    return NextResponse.json({ error: err.message || 'Resolve failed' }, { status: 500 });
  }
}
