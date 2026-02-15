// POST /api/match/[code]/join — Join match by invite code (REAL on-chain)

import { NextRequest, NextResponse } from 'next/server';
import { type Address } from 'viem';
import { writeServerContract, waitForTx, parseEvent, ensureUsdcApproval, getServerAddress, toBytes } from '@/lib/server-wallet';
import { ARENA_ADDRESS, PIXIE_ARENA_ABI } from '@/lib/arena';
import { getArenaStore } from '@/lib/arena-store';
import { getAgentStore } from '@/lib/agent-store';
import { getMatchByCode } from '@/lib/match-store';
import { createAgentState, startAgentLoop } from '@/lib/agent-loop';
import { encryptStrategy } from '@/lib/trade-engine';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { agentId, depositAmount } = await req.json();

    const arena = getMatchByCode(code);
    if (!arena) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (arena.entries.length >= arena.maxAgents) return NextResponse.json({ error: 'Match full' }, { status: 400 });
    if (arena.resolved) return NextResponse.json({ error: 'Match already resolved' }, { status: 400 });
    if (Date.now() > arena.deadline) return NextResponse.json({ error: 'Match expired' }, { status: 400 });

    const agentStore = getAgentStore();
    const agent = agentStore.get(String(agentId));
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    // Check if agent already joined
    if (arena.entries.some(e => e.agentId === agent.id)) {
      return NextResponse.json({ error: 'Agent already in this match' }, { status: 400 });
    }

    // 1. BITE-encrypt strategy (REAL)
    console.log(`[match/join] BITE encrypting strategy for ${agent.name}...`);
    const encryptedStrategy = await encryptStrategy(JSON.stringify(agent.config));

    // 2. Ensure USDC approved for entry fee
    if (arena.entryFee > 0) {
      await ensureUsdcApproval(ARENA_ADDRESS);
    }

    // 3. Join arena on-chain (REAL TX)
    console.log(`[match/join] Joining match ${code} (arena #${arena.onChainId}) with ${agent.name}...`);
    const txHash = await writeServerContract({
      address: ARENA_ADDRESS,
      abi: PIXIE_ARENA_ABI,
      functionName: 'joinArena',
      args: [BigInt(arena.onChainId), BigInt(agent.onChainId), toBytes(encryptedStrategy)],
      gas: 2000000n,
    });

    const receipt = await waitForTx(txHash);
    let entryIndex = arena.entries.length;
    const eventArgs = parseEvent(receipt, PIXIE_ARENA_ABI as any, 'AgentJoined');
    if (eventArgs?.entryIndex !== undefined) {
      entryIndex = Number(eventArgs.entryIndex);
    }

    console.log(`[match/join] ${agent.name} joined match ${code} at entry #${entryIndex}, tx: ${txHash}`);

    // 4. Cache entry
    const arenaStore = getArenaStore();
    arenaStore.addEntry(arena.id, {
      agentId: agent.id,
      agentName: agent.name,
      owner: getServerAddress(),
      entryIndex,
      encryptedStrategy,
      joinTxHash: txHash,
      tradeCount: 0,
      pnl: 0,
      sealedOrderCount: 0,
      revealed: false,
    });

    agentStore.incrementArenas(agent.id);

    // 5. Create agent state with accent color
    const colorIndex = arena.entries.length - 1; // just added
    const agentState = createAgentState(
      agent.id,
      agent.config,
      getServerAddress() as Address,
      depositAmount || 10,
      arena.onChainId,
      entryIndex,
      colorIndex,
      arena.id,
    );

    arena.agentStates.set(agent.id, agentState);

    // 6. Start autonomous loop with match-specific tick interval
    if (!arena.activeLoops.has(agent.id)) {
      arena.activeLoops.add(agent.id);
      startAgentLoop(arena.id, agent.id, arena.tickInterval || 15000);
    }

    return NextResponse.json({
      success: true,
      txHash,
      entryIndex,
      agentName: agent.name,
      accentColor: agentState.accentColor,
      biteOps: 1,
      onChain: true,
    });
  } catch (err: any) {
    console.error('Match join error:', err);
    return NextResponse.json({ error: err.message || 'Failed to join match' }, { status: 500 });
  }
}
