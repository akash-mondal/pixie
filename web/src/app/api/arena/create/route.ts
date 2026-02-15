// POST /api/arena/create — Create arena on PixieArena contract (REAL ON-CHAIN TX)

import { NextRequest, NextResponse } from 'next/server';
import { writeServerContract, waitForTx, parseEvent, ensureUsdcApproval } from '@/lib/server-wallet';
import { ARENA_ADDRESS, PIXIE_ARENA_ABI, getArenaCount } from '@/lib/arena';
import { getArenaStore } from '@/lib/arena-store';
import { parseUsdc } from '@/lib/contract';

export async function POST(req: NextRequest) {
  try {
    const { creator, entryFee = 0, prizePool = 1, maxAgents = 5, duration = 300 } = await req.json();

    const prizeRaw = parseUsdc(prizePool);
    const entryFeeRaw = parseUsdc(entryFee);

    // 1. Ensure USDC approved to PixieArena
    console.log(`[arena/create] Ensuring USDC approval to ${ARENA_ADDRESS}...`);
    await ensureUsdcApproval(ARENA_ADDRESS);

    // 2. Read arena count before
    const countBefore = await getArenaCount();

    // 3. Create arena on-chain (REAL TX)
    console.log(`[arena/create] Creating arena: entryFee=${entryFee} USDC, prize=${prizePool} USDC, maxAgents=${maxAgents}, duration=${duration}s`);
    const txHash = await writeServerContract({
      address: ARENA_ADDRESS,
      abi: PIXIE_ARENA_ABI,
      functionName: 'createArena',
      args: [entryFeeRaw, BigInt(maxAgents), BigInt(duration), prizeRaw],
      gas: 500000n,
    });

    // 4. Wait for receipt
    const receipt = await waitForTx(txHash);

    // Parse ArenaCreated event
    let arenaId: number;
    const eventArgs = parseEvent(receipt, PIXIE_ARENA_ABI as any, 'ArenaCreated');
    if (eventArgs?.arenaId !== undefined) {
      arenaId = Number(eventArgs.arenaId);
    } else {
      arenaId = countBefore; // 0-indexed
    }

    console.log(`[arena/create] Arena #${arenaId} created, tx: ${txHash}`);

    // 5. Cache in store
    const now = Date.now();
    const deadline = now + duration * 1000;
    getArenaStore().add({
      id: String(arenaId),
      onChainId: arenaId,
      onChainIdV3: -1,
      creator: creator || 'server',
      entryFee,
      prizePool,
      maxAgents,
      duration,
      deadline,
      txHash,
      inviteCode: '',
      timeframe: 'standard',
      mode: 'standard' as any,
      tickInterval: 15000,
      phase: 'trading',
      phaseStartedAt: now,
      tradingStartsAt: now,
      roundNumber: 1,
      userAgentId: '',
      lobbyAgents: [],
      allReady: false,
      entries: [],
      resolved: false,
      biteOps: 0,
      totalTrades: 0,
      x402Payments: 0,
      x402TotalUsd: 0,
      sealedOrderCount: 0,
      events: [],
      agentStates: new Map(),
      activeLoops: new Set(),
    });

    return NextResponse.json({
      arenaId,
      txHash,
      deadline,
      prizePool,
      maxAgents,
      onChain: true,
    });
  } catch (err: any) {
    console.error('Arena create error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create arena' }, { status: 500 });
  }
}
