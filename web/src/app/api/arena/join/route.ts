// POST /api/arena/join — Join arena on-chain + start autonomous agent loop (REAL)

import { NextRequest, NextResponse } from 'next/server';
import { type Address } from 'viem';
import { writeServerContract, waitForTx, parseEvent, ensureUsdcApproval, getServerAddress, toBytes } from '@/lib/server-wallet';
import { ARENA_ADDRESS, PIXIE_ARENA_ABI } from '@/lib/arena';
import { getArenaStore } from '@/lib/arena-store';
import { getAgentStore } from '@/lib/agent-store';
import { createAgentState, agentTick, type TickEvent } from '@/lib/agent-loop';
import { encryptStrategy } from '@/lib/trade-engine';

export async function POST(req: NextRequest) {
  try {
    const { arenaId, agentId, depositAmount } = await req.json();

    const arenaStore = getArenaStore();
    const agentStore = getAgentStore();

    const arena = arenaStore.get(String(arenaId));
    if (!arena) return NextResponse.json({ error: 'Arena not found in cache' }, { status: 404 });
    if (arena.entries.length >= arena.maxAgents) return NextResponse.json({ error: 'Arena full' }, { status: 400 });
    if (arena.resolved) return NextResponse.json({ error: 'Arena resolved' }, { status: 400 });

    const agent = agentStore.get(String(agentId));
    if (!agent) return NextResponse.json({ error: 'Agent not found in cache' }, { status: 404 });

    // 1. BITE-encrypt strategy (REAL BITE operation)
    console.log(`[arena/join] BITE encrypting strategy for ${agent.name}...`);
    const encryptedStrategy = await encryptStrategy(JSON.stringify(agent.config));

    // 2. Ensure USDC approved for entry fee
    if (arena.entryFee > 0) {
      await ensureUsdcApproval(ARENA_ADDRESS);
    }

    // 3. Join arena on-chain (REAL TX)
    console.log(`[arena/join] Joining arena #${arena.onChainId} with agent #${agent.onChainId} (${agent.name})...`);
    const txHash = await writeServerContract({
      address: ARENA_ADDRESS,
      abi: PIXIE_ARENA_ABI,
      functionName: 'joinArena',
      args: [BigInt(arena.onChainId), BigInt(agent.onChainId), toBytes(encryptedStrategy)],
      gas: 2000000n,
    });

    // 4. Wait for receipt + parse event
    const receipt = await waitForTx(txHash);
    let entryIndex = arena.entries.length; // fallback
    const eventArgs = parseEvent(receipt, PIXIE_ARENA_ABI as any, 'AgentJoined');
    if (eventArgs?.entryIndex !== undefined) {
      entryIndex = Number(eventArgs.entryIndex);
    }

    console.log(`[arena/join] ${agent.name} joined arena #${arena.onChainId} at entry #${entryIndex}, tx: ${txHash}`);

    // 5. Cache entry
    arenaStore.addEntry(String(arenaId), {
      agentId: agent.id,
      agentName: agent.name,
      owner: getServerAddress(),
      entryIndex,
      encryptedStrategy,
      joinTxHash: txHash,
      tradeCount: 0,
      pnl: 0,
      revealed: false,
    });

    agentStore.incrementArenas(String(agentId));

    // 6. Create agent state for autonomous loop
    const agentState = createAgentState(
      agent.id,
      agent.config,
      getServerAddress() as Address,
      depositAmount || 10, // USDC starting balance
      arena.onChainId,
      entryIndex,
      0, // colorIndex
      arena.id,
    );

    arena.agentStates.set(agent.id, agentState);

    // 7. Start autonomous loop if not already running
    if (!arena.activeLoops.has(agent.id)) {
      arena.activeLoops.add(agent.id);
      startAgentLoop(String(arenaId), agent.id);
    }

    return NextResponse.json({
      success: true,
      txHash,
      entryIndex,
      agentName: agent.name,
      biteOps: 1,
      onChain: true,
    });
  } catch (err: any) {
    console.error('Arena join error:', err);
    return NextResponse.json({ error: err.message || 'Failed to join arena' }, { status: 500 });
  }
}

// Start the autonomous agent loop (runs server-side)
function startAgentLoop(arenaId: string, agentId: string) {
  const TICK_INTERVAL = 15000; // 15 seconds

  const interval = setInterval(async () => {
    const arenaStore = getArenaStore();
    const arena = arenaStore.get(arenaId);

    if (!arena || arena.resolved || Date.now() > arena.deadline) {
      clearInterval(interval);
      arena?.activeLoops.delete(agentId);
      return;
    }

    const state = arena.agentStates.get(agentId);
    if (!state || state.stopped) {
      clearInterval(interval);
      arena.activeLoops.delete(agentId);
      return;
    }

    const emit = (event: TickEvent) => {
      arenaStore.addEvent(arenaId, event);

      // Update entry trade count
      const entry = arena.entries.find(e => e.agentId === agentId);
      if (entry && event.type === 'executed') {
        entry.tradeCount++;
      }
    };

    try {
      const newState = await agentTick(state, emit);
      arena.agentStates.set(agentId, newState);

      // Update entry P&L
      const entry = arena.entries.find(e => e.agentId === agentId);
      if (entry) {
        entry.pnl = newState.pnl;
      }

      // Update agent store trade count
      if (newState.trades.length > state.trades.length) {
        const agentStore = getAgentStore();
        agentStore.incrementTrades(agentId, newState.trades.length - state.trades.length);
      }
    } catch (err: any) {
      emit({
        type: 'error',
        agentId,
        agentName: state.agentName,
        message: `loop error: ${err.message}`,
        timestamp: Date.now(),
      });
    }
  }, TICK_INTERVAL);
}
