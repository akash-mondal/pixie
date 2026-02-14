// Arena Lifecycle — session-based encrypted agent arena
// User picks mode + agent → startSession → lobby pipeline → trading → reveal
// No invite codes, no spectation, no hardcoded agents

import { type GameMode, GAME_MODES } from './system-agents';
import { getArenaStore, type StoredArena, type ArenaPhase, type LobbyAgent } from './arena-store';
import { createAgentState, startAgentLoop } from './agent-loop';
import { type AgentConfig, buildSystemPrompt } from './agent-builder';
import { getAgentAddress, reclaimAgentFunds } from './agent-wallet';
import { writeServerContract, waitForTx, ensureUsdcApproval, getServerAddress, getServerPublicClient } from './server-wallet';
import { unwindToUsdc, getOnChainBalance } from './dex-swap';
import { USDC_ADDRESS, WETH_ADDRESS, WBTC_ADDRESS, ALGEBRA_SWAP_ROUTER, SWAP_ROUTER_ABI } from './algebra';
import { PIXIE_ARENA_ABI, ARENA_ADDRESS } from './arena';
import { generateOpponents } from './opponent-generator';
import { processAllAgents } from './lobby-pipeline';
import { getMemory, formatMemoryForPrompt, recordRound, addLesson, type ShortTermMemory } from './agent-memory';
import { getAgentStore } from './agent-store';
import { type Address } from 'viem';

// --- Create on-chain arena (server wallet is the platform creator) ---

async function createOnChainArena(duration: number, maxAgents: number): Promise<{ onChainId: number; txHash: string }> {
  try {
    await ensureUsdcApproval(ARENA_ADDRESS);

    const txHash = await writeServerContract({
      address: ARENA_ADDRESS,
      abi: PIXIE_ARENA_ABI,
      functionName: 'createArena',
      args: [0n, BigInt(maxAgents), BigInt(duration), 10000n], // entryFee=0, prize=$0.01
      gas: 500000n,
    });

    const receipt = await waitForTx(txHash);

    const { parseEvent } = await import('./server-wallet');
    const event = parseEvent(receipt, PIXIE_ARENA_ABI as any, 'ArenaCreated');
    const onChainId = event ? Number(event.arenaId) : 0;

    console.log(`[lifecycle] Created on-chain arena #${onChainId} — tx: ${txHash.slice(0, 14)}...`);
    return { onChainId, txHash };
  } catch (err: any) {
    console.error(`[lifecycle] On-chain createArena failed:`, err.message);
    return { onChainId: 0, txHash: '' };
  }
}

// --- Phase transitions ---

function setPhase(arena: StoredArena, phase: ArenaPhase) {
  arena.phase = phase;
  arena.phaseStartedAt = Date.now();

  const arenaStore = getArenaStore();
  arenaStore.addEvent(arena.id, {
    type: 'analyzing',
    agentId: 'system',
    agentName: 'PIXIE',
    message: `phase: ${phase.toUpperCase()}`,
    data: { phase, mode: arena.mode, roundNumber: arena.roundNumber },
    timestamp: Date.now(),
  });
}

function startTrading(arena: StoredArena) {
  setPhase(arena, 'trading');
  arena.deadline = Date.now() + arena.duration * 1000;
  arena.tradingStartsAt = Date.now();

  // Create agent states + start loops for all entries
  for (const entry of arena.entries) {
    const lobby = arena.lobbyAgents.find(la => la.agentId === entry.agentId);
    if (!lobby) continue;

    // Build system prompt with memory injection
    const memory = getMemory(entry.agentId);
    const memoryContext = memory ? formatMemoryForPrompt(entry.agentId) : '';
    const basePrompt = buildSystemPrompt(lobby.config);
    const fullPrompt = memoryContext ? `${basePrompt}\n\n${memoryContext}` : basePrompt;

    const state = createAgentState(
      entry.agentId,
      lobby.config,
      entry.owner as Address,
      0.50, // real USDC funded to each agent wallet
      arena.onChainId,
      entry.entryIndex,
      entry.entryIndex, // colorIndex
      arena.id,
    );

    state.systemPrompt = fullPrompt;
    arena.agentStates.set(entry.agentId, state);

    // Start loop
    if (!arena.activeLoops.has(entry.agentId)) {
      arena.activeLoops.add(entry.agentId);
      startAgentLoop(arena.id, entry.agentId, arena.tickInterval);
    }
  }

  console.log(`[lifecycle] Trading started for arena ${arena.id} — ${arena.entries.length} agents, ${arena.duration}s`);

  // Start market mover — server wallet swaps to create real price volatility
  startMarketMover(arena).catch(err =>
    console.error(`[market-mover] Failed to start:`, err.message)
  );
}

// --- Market Mover — server wallet swaps to create price volatility & meaningful P&L ---

const MARKET_MOVER_TICK_MS = 12000; // 12s between market-moving swaps

// HMR-safe interval tracking
const _g = globalThis as any;
function getMarketMovers(): Map<string, ReturnType<typeof setInterval>> {
  if (!_g.__pixieMarketMovers) _g.__pixieMarketMovers = new Map();
  return _g.__pixieMarketMovers;
}

// Server token approval cache (HMR-safe)
function getServerApprovals(): Set<string> {
  if (!_g.__pixieServerApprovals) _g.__pixieServerApprovals = new Set();
  return _g.__pixieServerApprovals;
}

async function ensureServerTokenApproval(tokenAddress: Address, spender: Address) {
  const approvals = getServerApprovals();
  const key = `${tokenAddress}:${spender}`;
  if (approvals.has(key)) return;

  const pc = getServerPublicClient();
  const maxUint = 2n ** 256n - 1n;

  const allowance = await pc.readContract({
    address: tokenAddress,
    abi: [{ name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const,
    functionName: 'allowance',
    args: [getServerAddress(), spender],
  });

  if ((allowance as bigint) >= maxUint / 2n) {
    approvals.add(key);
    return;
  }

  const hash = await writeServerContract({
    address: tokenAddress,
    abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }] as const,
    functionName: 'approve',
    args: [spender, maxUint],
  });
  await waitForTx(hash);
  approvals.add(key);
  console.log(`[market-mover] Approved ${tokenAddress.slice(0, 8)}... to ${spender.slice(0, 8)}...`);
}

// Execute a swap using the server wallet
async function executeServerSwap(tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<string> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const serverAddr = getServerAddress();

  const hash = await writeServerContract({
    address: ALGEBRA_SWAP_ROUTER,
    abi: SWAP_ROUTER_ABI as any,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn,
      tokenOut,
      deployer: '0x0000000000000000000000000000000000000000' as Address,
      recipient: serverAddr,
      deadline,
      amountIn,
      amountOutMinimum: 0n,
      limitSqrtPrice: 0n,
    }],
    gas: 12000000n, // Algebra plugin hooks need high gas
  });

  await waitForTx(hash);
  return hash;
}

// Pair config for market mover: tokenA/tokenB with USD-equivalent sizing
interface MarketMoverPair {
  label: string;
  tokenA: Address; // the "base" token (buy = USDC→tokenA)
  tokenB: Address; // the "quote" token (usually USDC, or WETH for ETH/WBTC)
  buyAmount: (usd: number) => bigint;  // convert USD amount to tokenB units for buying tokenA
  sellAmount: (usd: number) => bigint; // convert USD amount to tokenA units for selling
}

function getPairsForMode(mode: GameMode): MarketMoverPair[] {
  const modeConfig = GAME_MODES[mode];
  const pairs: MarketMoverPair[] = [];

  for (const pair of modeConfig.pairs) {
    if (pair === 'ETH/USDC') {
      pairs.push({
        label: 'ETH',
        tokenA: WETH_ADDRESS,
        tokenB: USDC_ADDRESS,
        buyAmount: (usd) => BigInt(usd) * 1000000n, // USDC 6 decimals
        sellAmount: (usd) => BigInt(Math.floor(usd / 2500 * 1e18)), // WETH 18 decimals at ~$2500
      });
    } else if (pair === 'WBTC/USDC') {
      pairs.push({
        label: 'BTC',
        tokenA: WBTC_ADDRESS,
        tokenB: USDC_ADDRESS,
        buyAmount: (usd) => BigInt(usd) * 1000000n, // USDC 6 decimals
        sellAmount: (usd) => BigInt(Math.floor(usd / 97000 * 1e8)), // WBTC 8 decimals at ~$97K
      });
    } else if (pair === 'ETH/WBTC') {
      pairs.push({
        label: 'ETH/BTC',
        tokenA: WETH_ADDRESS,
        tokenB: WBTC_ADDRESS,
        buyAmount: (usd) => BigInt(Math.floor(usd / 97000 * 1e8)), // WBTC 8 decimals
        sellAmount: (usd) => BigInt(Math.floor(usd / 2500 * 1e18)), // WETH 18 decimals
      });
    }
  }

  return pairs;
}

async function startMarketMover(arena: StoredArena) {
  const arenaStore = getArenaStore();
  const pairs = getPairsForMode(arena.mode);

  // Ensure server wallet tokens approved to SwapRouter for all pairs
  try {
    await ensureUsdcApproval(ALGEBRA_SWAP_ROUTER);
    await ensureServerTokenApproval(WETH_ADDRESS, ALGEBRA_SWAP_ROUTER);
    // Approve WBTC if any pair uses it
    if (pairs.some(p => p.tokenA === WBTC_ADDRESS || p.tokenB === WBTC_ADDRESS)) {
      await ensureServerTokenApproval(WBTC_ADDRESS, ALGEBRA_SWAP_ROUTER);
    }
  } catch (err: any) {
    console.error(`[market-mover] Approval setup failed:`, err.message);
    return;
  }

  let tick = 0;
  const totalTicks = Math.floor(arena.duration * 1000 / MARKET_MOVER_TICK_MS);
  const midpoint = Math.floor(totalTicks * 0.55); // slightly longer bull phase

  console.log(`[market-mover] Starting for arena ${arena.id} — ${totalTicks} ticks, ${pairs.length} pairs (${pairs.map(p => p.label).join(', ')}), midpoint at tick ${midpoint}`);

  arenaStore.addEvent(arena.id, {
    type: 'analyzing',
    agentId: 'system',
    agentName: 'PIXIE',
    message: `market maker active — ${pairs.map(p => p.label).join(', ')} volatility enabled`,
    data: { marketMover: true, totalTicks, midpoint, pairs: pairs.map(p => p.label) },
    timestamp: Date.now(),
  });

  const interval = setInterval(async () => {
    if (arena.resolved || Date.now() > (arena.deadline || Infinity)) {
      clearInterval(interval);
      getMarketMovers().delete(arena.id);
      console.log(`[market-mover] Stopped for arena ${arena.id}`);
      return;
    }

    tick++;

    // Pick a random pair to move this tick
    const pair = pairs[tick % pairs.length];

    try {
      // Trend with noise: 80% in trend direction, 20% counter-trend
      const trendBias = tick <= midpoint ? 0.80 : 0.20;
      const isBuy = Math.random() < trendBias;

      // Random amount: 80-200 USD worth
      const baseAmount = 80 + Math.floor(Math.random() * 120);

      let txHash: string;
      if (isBuy) {
        // Buy tokenA with tokenB
        txHash = await executeServerSwap(pair.tokenB, pair.tokenA, pair.buyAmount(baseAmount));
      } else {
        // Sell tokenA for tokenB
        txHash = await executeServerSwap(pair.tokenA, pair.tokenB, pair.sellAmount(baseAmount));
      }

      arenaStore.addEvent(arena.id, {
        type: 'analyzing',
        agentId: 'system',
        agentName: 'PIXIE',
        message: `market ${isBuy ? 'bullish' : 'bearish'} pressure: $${baseAmount} ${isBuy ? 'BUY' : 'SELL'} ${pair.label} — tx: ${txHash.slice(0, 14)}...`,
        data: { marketMover: true, pair: pair.label, direction: isBuy ? 'buy' : 'sell', amount: baseAmount, txHash },
        timestamp: Date.now(),
      });

      console.log(`[market-mover] Tick ${tick}/${totalTicks}: ${isBuy ? 'BUY' : 'SELL'} $${baseAmount} ${pair.label} — ${txHash.slice(0, 14)}...`);
    } catch (err: any) {
      console.error(`[market-mover] Tick ${tick} ${pair.label} swap failed:`, err.message);
    }
  }, MARKET_MOVER_TICK_MS);

  getMarketMovers().set(arena.id, interval);
}

function stopMarketMover(arenaId: string) {
  const movers = getMarketMovers();
  const interval = movers.get(arenaId);
  if (interval) {
    clearInterval(interval);
    movers.delete(arenaId);
    console.log(`[market-mover] Cleaned up for arena ${arenaId}`);
  }
}

// --- Resolve arena (reveal phase) ---

async function resolveArena(arena: StoredArena) {
  if (arena.resolved || (arena as any)._resolving) return;
  (arena as any)._resolving = true; // prevent concurrent resolve calls

  setPhase(arena, 'reveal');
  arena.resolvedAt = Date.now();

  // Stop all loops + market mover
  arena.activeLoops.clear();
  stopMarketMover(arena.id);

  const arenaStore = getArenaStore();
  const STARTING_USDC = 500000n; // 0.50 USDC in 6-decimal units

  arenaStore.addEvent(arena.id, {
    type: 'stop',
    agentId: 'system',
    agentName: 'PIXIE',
    message: 'Match time expired - triggering BITE CTX batch reveal...',
    timestamp: Date.now(),
  });

  // Finalize on-chain arena
  try {
    const { parseEther } = await import('viem');
    const txHash = await writeServerContract({
      address: ARENA_ADDRESS,
      abi: PIXIE_ARENA_ABI,
      functionName: 'finalizeArena',
      args: [BigInt(arena.onChainId)],
      value: parseEther('0.001'),
      gas: 2000000n,
    });
    await waitForTx(txHash);

    arenaStore.addEvent(arena.id, {
      type: 'recording',
      agentId: 'system',
      agentName: 'PIXIE',
      message: `BITE CTX submitted: ${txHash.slice(0, 14)}... - all strategies revealed`,
      data: { txHash },
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('[lifecycle] finalizeArena failed:', err.message);
  }

  // Unwind all agent positions (sell non-USDC -> USDC) + calculate real P&L
  for (const entry of arena.entries) {
    entry.revealed = true;
    const state = arena.agentStates.get(entry.agentId);
    entry.tradeCount = state?.trades.length || 0;

    try {
      // Unwind non-USDC tokens back to USDC
      const { finalUsdcBalance, txHashes } = await unwindToUsdc(entry.agentId);

      if (txHashes.length > 0) {
        arenaStore.addEvent(arena.id, {
          type: 'recording',
          agentId: entry.agentId,
          agentName: entry.agentName,
          message: `unwound positions - ${txHashes.length} swap(s) back to USDC`,
          data: { txHashes },
          timestamp: Date.now(),
        });
      }

      // Calculate real P&L from final USDC balance
      const realPnlBps = finalUsdcBalance > 0n
        ? Number((finalUsdcBalance - STARTING_USDC) * 10000n / STARTING_USDC)
        : (state?.pnl || 0);
      entry.pnl = realPnlBps;

      console.log(`[lifecycle] ${entry.agentName} final USDC: ${Number(finalUsdcBalance) / 1e6} ($${(Number(finalUsdcBalance) / 1e6).toFixed(4)}) - P&L: ${realPnlBps}bps`);
    } catch (err: any) {
      console.error(`[lifecycle] Unwind failed for ${entry.agentName}:`, err.message);
      // Fall back to agent state P&L
      entry.pnl = state?.pnl || 0;
    }
  }

  arena.resolved = true;
  arena.biteOps += 2; // batch CTX reveal

  const sorted = [...arena.entries].sort((a, b) => b.pnl - a.pnl);

  arenaStore.addEvent(arena.id, {
    type: 'analyzing',
    agentId: 'system',
    agentName: 'PIXIE',
    message: `BITE CTX batch reveal - strategies decrypted`,
    data: {
      leaderboard: sorted.map((e, i) => ({
        rank: i + 1,
        agentName: e.agentName,
        pnl: e.pnl,
        trades: e.tradeCount,
      })),
    },
    timestamp: Date.now(),
  });

  // Update agent memories
  updateMemoriesAfterRound(arena);

  console.log(`[lifecycle] Arena ${arena.id} resolved - winner: ${sorted[0]?.agentName} (+${sorted[0]?.pnl}bps)`);

  // Reclaim USDC from opponent agents back to server wallet
  reclaimOpponentFunds(arena).catch(err =>
    console.error(`[lifecycle] Fund reclaim failed:`, err.message)
  );
}

// --- Reclaim funds from opponent agents after session ends ---

async function reclaimOpponentFunds(arena: StoredArena) {
  const opponents = arena.lobbyAgents.filter(la => !la.isUser);
  console.log(`[lifecycle] Reclaiming funds from ${opponents.length} opponents...`);

  let reclaimed = 0;
  for (const opp of opponents) {
    const hash = await reclaimAgentFunds(opp.agentId);
    if (hash) reclaimed++;
  }

  console.log(`[lifecycle] Reclaimed funds from ${reclaimed}/${opponents.length} opponents`);
}

// --- Update agent memories after a round ---

function updateMemoriesAfterRound(arena: StoredArena) {
  const sorted = [...arena.entries].sort((a, b) => b.pnl - a.pnl);

  for (const entry of arena.entries) {
    const state = arena.agentStates.get(entry.agentId);
    if (!state) continue;

    const rank = sorted.findIndex(e => e.agentId === entry.agentId) + 1;

    const round: ShortTermMemory = {
      roundNumber: arena.roundNumber,
      trades: state.trades.map(t => ({
        pair: t.pair,
        direction: t.direction,
        amountPercent: Math.round((t.amountIn / state.startingValue) * 100),
        reasoning: t.reasoning,
        pnlBps: t.simulatedPnL,
      })),
      intelPurchased: [],
      intelSold: [],
      marketConditions: `${GAME_MODES[arena.mode].label} match`,
      totalPnl: state.pnl,
      rank,
    };

    recordRound(entry.agentId, round);

    if (rank === 1) {
      addLesson(entry.agentId, `Won match with +${state.pnl}bps — strategy was effective`);
    } else if (state.pnl < -200) {
      addLesson(entry.agentId, `Lost ${Math.abs(state.pnl)}bps — need to be more cautious`);
    }
  }
}

// --- Start a new session ---

export async function startSession(
  mode: GameMode,
  userAgentId: string,
  userConfig: AgentConfig,
  userWalletAddress: string,
  userIdentityId: number,
): Promise<{ sessionId: string }> {
  const modeConfig = GAME_MODES[mode];
  const sessionId = `${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const totalAgents = modeConfig.maxOpponents + 1; // opponents + user

  console.log(`[lifecycle] Starting session ${sessionId} — mode: ${modeConfig.label}, opponents: ${modeConfig.maxOpponents}`);

  // 1. Generate opponents
  const opponents = await generateOpponents(mode, modeConfig.maxOpponents);

  // 2. Create on-chain arena
  const { onChainId, txHash: arenaTxHash } = await createOnChainArena(modeConfig.tradingDuration, totalAgents).catch(() => ({ onChainId: 0, txHash: '' }));

  // 3. Build lobby agents list (user first, then opponents)
  const lobbyAgents: LobbyAgent[] = [];

  // User's agent (already has wallet + funds + identity from /agents registration)
  lobbyAgents.push({
    agentId: userAgentId,
    agentName: userConfig.name,
    isUser: true,
    walletAddress: userWalletAddress,
    identityId: userIdentityId,
    readyStep: 'pending',
    config: userConfig,
    personality: userConfig.personality,
    archetype: 'custom',
    accentColor: '#06b6d4',
    entryIndex: 0,
  });

  // System opponents
  opponents.forEach((opp, i) => {
    lobbyAgents.push({
      agentId: `opp-${sessionId}-${i}`,
      agentName: opp.config.name,
      isUser: false,
      walletAddress: '',
      identityId: 0,
      readyStep: 'pending',
      config: opp.config,
      personality: opp.config.personality,
      archetype: opp.archetype,
      accentColor: opp.accentColor,
      entryIndex: i + 1,
    });
  });

  // 4. Build StoredArena
  const arena: StoredArena = {
    id: sessionId,
    onChainId,
    creator: userWalletAddress,
    entryFee: 0,
    prizePool: 0,
    maxAgents: totalAgents,
    duration: modeConfig.tradingDuration,
    deadline: 0, // set when trading starts
    txHash: arenaTxHash,
    timeframe: mode,
    mode,
    tickInterval: modeConfig.tickInterval,
    phase: 'lobby',
    phaseStartedAt: now,
    tradingStartsAt: 0,
    roundNumber: 1,
    userAgentId,
    lobbyAgents,
    allReady: false,
    entries: [],
    resolved: false,
    biteOps: 0,
    totalTrades: 0,
    x402Payments: 0,
    x402TotalUsd: 0,
    events: [],
    agentStates: new Map(),
    activeLoops: new Set(),
  };

  const arenaStore = getArenaStore();
  arenaStore.add(arena);

  // 5. Emit to SSE stream function — captures events for streaming
  const emit = (event: any) => arenaStore.addEvent(arena.id, event);

  // 6. Kick off lobby pipeline (async — don't await, let it run in background)
  processAllAgents(arena, emit).then(() => {
    // All agents ready — start trading
    if (arena.allReady) {
      console.log(`[lifecycle] All agents ready — starting trading for ${sessionId}`);
      startTrading(arena);

      // Auto-resolve when deadline passes (async unwind + settlement)
      setTimeout(() => {
        const currentArena = arenaStore.get(sessionId);
        if (currentArena && !currentArena.resolved) {
          resolveArena(currentArena).catch(err =>
            console.error(`[lifecycle] resolveArena failed:`, err.message)
          );
        }
      }, modeConfig.tradingDuration * 1000 + 2000); // +2s grace
    } else {
      console.error(`[lifecycle] Pipeline finished but not all agents ready for ${sessionId}`);
      // Force start anyway after a short delay
      setTimeout(() => {
        const currentArena = arenaStore.get(sessionId);
        if (currentArena && currentArena.phase === 'lobby') {
          console.log(`[lifecycle] Force-starting trading for ${sessionId} (some agents not ready)`);
          startTrading(currentArena);
          setTimeout(() => {
            const a = arenaStore.get(sessionId);
            if (a && !a.resolved) {
              resolveArena(a).catch(err =>
                console.error(`[lifecycle] resolveArena failed:`, err.message)
              );
            }
          }, modeConfig.tradingDuration * 1000 + 2000);
        }
      }, 5000);
    }
  }).catch(err => {
    console.error(`[lifecycle] Lobby pipeline failed for ${sessionId}:`, err.message);
  });

  return { sessionId };
}

// --- Global stats ---

export function getGlobalStats(): {
  totalAgents: number;
  totalRounds: number;
  totalBiteOps: number;
  totalTrades: number;
  totalX402Payments: number;
  totalX402Usd: number;
} {
  const arenaStore = getArenaStore();
  const allArenas = arenaStore.getAll();
  const agentStore = getAgentStore();

  let totalBiteOps = 0;
  let totalTrades = 0;
  let totalX402Payments = 0;
  let totalX402Usd = 0;
  let totalRounds = 0;

  for (const arena of allArenas) {
    totalBiteOps += arena.biteOps;
    totalTrades += arena.totalTrades;
    totalX402Payments += arena.x402Payments;
    totalX402Usd += arena.x402TotalUsd;
    if (arena.resolved) totalRounds++;
  }

  return {
    totalAgents: agentStore.getAll().length,
    totalRounds,
    totalBiteOps,
    totalTrades,
    totalX402Payments,
    totalX402Usd,
  };
}

// Re-export for convenience
export { resolveArena, setPhase };
