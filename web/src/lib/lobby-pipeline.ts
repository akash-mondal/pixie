// Lobby Pipeline — walks each agent through readiness steps before trading starts
// Sequential processing to avoid nonce races on server wallet

import { type StoredArena, type LobbyAgent, type AgentReadyStep, getArenaStore } from './arena-store';
import { type TickEvent } from './agent-loop';
import { createAgentWallet, fundAgentWallet, fundAgentSfuel, getAgentAddress } from './agent-wallet';
import { writeServerContract, waitForTx, getServerAddress } from './server-wallet';
import { encryptStrategy } from './trade-engine';
import { IDENTITY_REGISTRY, IDENTITY_ABI } from './identity';
import { serializeConfig } from './agent-builder';
import { initMemory } from './agent-memory';
import { approveForSwap, approveTokenTo } from './dex-swap';
import { USDC_ADDRESS } from './algebra';
import { ARENA_V3_ADDRESS, PIXIE_ARENA_V3_ABI } from './arena-v3';

type EmitFn = (event: TickEvent) => void;

// Emit a lobby step event (optional txHash for explorer links)
function emitStep(emit: EmitFn, agent: LobbyAgent, step: AgentReadyStep, message: string, txHash?: string) {
  emit({
    type: 'analyzing' as any, // reuse existing event type for SSE compat
    agentId: agent.agentId,
    agentName: agent.agentName,
    message: `[lobby] ${message}`,
    data: { lobbyStep: step, isUser: agent.isUser, archetype: agent.archetype, ...(txHash ? { txHash } : {}) },
    timestamp: Date.now(),
  });
}

// Process a single opponent agent through all readiness steps
async function processOpponentAgent(
  agent: LobbyAgent,
  arena: StoredArena,
  emit: EmitFn,
): Promise<void> {
  const store = getArenaStore();
  const agentId = agent.agentId;

  // Step 1: Create wallet
  store.updateLobbyStep(arena.id, agentId, 'wallet');
  emitStep(emit, agent, 'wallet', 'creating wallet...');
  createAgentWallet(agentId);
  agent.walletAddress = getAgentAddress(agentId);
  initMemory(agentId, agent.agentName);

  // Step 2: Fund sFUEL
  store.updateLobbyStep(arena.id, agentId, 'sfuel');
  emitStep(emit, agent, 'sfuel', 'funding sFUEL...');
  const sfuelResult = await fundAgentSfuel(agentId);
  emitStep(emit, agent, 'sfuel', 'sFUEL funded', typeof sfuelResult === 'string' ? sfuelResult : undefined);

  // Step 3: Fund USDC
  store.updateLobbyStep(arena.id, agentId, 'usdc');
  emitStep(emit, agent, 'usdc', 'funding USDC ($0.50)...');
  const usdcResult = await fundAgentWallet(agentId, 0.50);
  emitStep(emit, agent, 'usdc', 'USDC funded', typeof usdcResult === 'string' ? usdcResult : undefined);

  // Step 3.5: Approve USDC to SwapRouter for real DEX trading
  emitStep(emit, agent, 'usdc', 'approving USDC for DEX trading...');
  await approveForSwap(agentId, USDC_ADDRESS);

  // Step 3.6: Approve USDC to server wallet for x402 on-chain settlement
  emitStep(emit, agent, 'usdc', 'approving USDC for x402 settlement...');
  await approveTokenTo(agentId, USDC_ADDRESS, getServerAddress());

  // Step 4: Register identity (ERC-8004)
  store.updateLobbyStep(arena.id, agentId, 'identity');
  emitStep(emit, agent, 'identity', 'registering ERC-8004 identity...');
  try {
    const agentURI = JSON.stringify({
      name: agent.agentName,
      personality: agent.personality.slice(0, 100),
      archetype: agent.archetype,
    });

    const txHash = await writeServerContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: 'registerWithURI',
      args: [agentURI],
      gas: 500000n,
    });
    const receipt = await waitForTx(txHash);

    // Try to get identity ID from event
    const { parseEvent } = await import('./server-wallet');
    const eventArgs = parseEvent(receipt, IDENTITY_ABI as any, 'Registered');
    agent.identityId = eventArgs?.agentId ? Number(eventArgs.agentId) : 0;

    emitStep(emit, agent, 'identity', `identity #${agent.identityId} registered`, txHash);
    console.log(`[lobby-pipeline] ${agent.agentName} registered identity #${agent.identityId}`);
  } catch (err: any) {
    console.error(`[lobby-pipeline] ${agent.agentName} identity registration failed:`, err.message);
    // Continue anyway — identity is nice-to-have for opponents
  }

  // Step 5: Encrypt strategy (BITE)
  store.updateLobbyStep(arena.id, agentId, 'encrypt');
  emitStep(emit, agent, 'encrypt', 'BITE encrypting strategy...');
  let encryptedConfig = '';
  try {
    encryptedConfig = await encryptStrategy(serializeConfig(agent.config));
    arena.biteOps += 1;
  } catch (err: any) {
    console.error(`[lobby-pipeline] ${agent.agentName} encrypt failed:`, err.message);
    encryptedConfig = '0x' + Buffer.from(agent.agentName).toString('hex'); // fallback
  }

  // Step 6: Join arena on-chain
  store.updateLobbyStep(arena.id, agentId, 'join');
  emitStep(emit, agent, 'join', 'joining arena on-chain...');
  let joinHash = '';
  if (arena.onChainId > 0) {
    try {
      const { writeAgentContract, waitForAgentTx } = await import('./agent-wallet');
      const { ARENA_ADDRESS, PIXIE_ARENA_ABI } = await import('./arena');
      const { toBytes } = await import('./server-wallet');

      const txHash = await writeAgentContract(agentId, {
        address: ARENA_ADDRESS,
        abi: PIXIE_ARENA_ABI,
        functionName: 'joinArena',
        args: [BigInt(arena.onChainId), BigInt(agent.entryIndex), toBytes(encryptedConfig)],
        gas: 2000000n,
      });
      await waitForAgentTx(txHash);
      joinHash = txHash;
      emitStep(emit, agent, 'join', `joined arena #${arena.onChainId}`, txHash);
      console.log(`[lobby-pipeline] ${agent.agentName} joined arena #${arena.onChainId} on-chain`);
    } catch (err: any) {
      console.error(`[lobby-pipeline] ${agent.agentName} joinArena failed:`, err.message);
    }
  }

  // Step 6.5: Join V3 arena + deposit $0.10 for sealed orders
  if (arena.onChainIdV3 >= 0) {
    try {
      const { writeAgentContract, waitForAgentTx } = await import('./agent-wallet');
      const { toBytes } = await import('./server-wallet');

      // Join V3 arena
      emitStep(emit, agent, 'join', 'joining sealed order vault (V3)...');
      const v3JoinHash = await writeAgentContract(agentId, {
        address: ARENA_V3_ADDRESS,
        abi: PIXIE_ARENA_V3_ABI,
        functionName: 'joinArena',
        args: [BigInt(arena.onChainIdV3), BigInt(agent.entryIndex), toBytes(encryptedConfig)],
        gas: 2000000n,
      });
      await waitForAgentTx(v3JoinHash);

      // Approve USDC to V3
      await approveTokenTo(agentId, USDC_ADDRESS, ARENA_V3_ADDRESS);

      // Deposit $0.10 USDC for sealed orders
      const depositAmount = 100000n; // 0.10 USDC (6 decimals)
      emitStep(emit, agent, 'usdc', 'depositing $0.10 to sealed order vault...');
      const depositHash = await writeAgentContract(agentId, {
        address: ARENA_V3_ADDRESS,
        abi: PIXIE_ARENA_V3_ABI,
        functionName: 'depositTokens',
        args: [BigInt(arena.onChainIdV3), BigInt(agent.entryIndex), USDC_ADDRESS, depositAmount],
        gas: 500000n,
      });
      await waitForAgentTx(depositHash);
      emitStep(emit, agent, 'usdc', 'deposited $0.10 to sealed order vault', depositHash);
    } catch (err: any) {
      console.error(`[lobby-pipeline] ${agent.agentName} V3 join/deposit failed:`, err.message);
    }
  }

  // Step 7: Ready!
  store.updateLobbyStep(arena.id, agentId, 'ready');
  emitStep(emit, agent, 'ready', 'READY');

  // Add to arena entries
  arena.entries.push({
    agentId,
    agentName: agent.agentName,
    owner: agent.walletAddress,
    entryIndex: agent.entryIndex,
    encryptedStrategy: encryptedConfig,
    joinTxHash: joinHash,
    tradeCount: 0,
    pnl: 0,
    sealedOrderCount: 0,
    revealed: false,
  });
}

// Process the user's agent (skip wallet/fund/identity — already done at /agents)
async function processUserAgent(
  agent: LobbyAgent,
  arena: StoredArena,
  emit: EmitFn,
): Promise<void> {
  const store = getArenaStore();
  const agentId = agent.agentId;

  // User agent already has wallet + funds + identity from /agents registration
  // Just need to encrypt + join

  // Skip to encrypt step
  store.updateLobbyStep(arena.id, agentId, 'encrypt');
  emitStep(emit, agent, 'encrypt', 'BITE encrypting strategy...');
  let encryptedConfig = '';
  try {
    encryptedConfig = await encryptStrategy(serializeConfig(agent.config));
    arena.biteOps += 1;
  } catch (err: any) {
    console.error(`[lobby-pipeline] ${agent.agentName} encrypt failed:`, err.message);
    encryptedConfig = '0x' + Buffer.from(agent.agentName).toString('hex');
  }

  // Ensure sFUEL for joining (might have been spent)
  await fundAgentSfuel(agentId).catch(() => {});

  // Approve USDC to SwapRouter for real DEX trading
  await approveForSwap(agentId, USDC_ADDRESS).catch(() => {});

  // Approve USDC to server wallet for x402 on-chain settlement
  await approveTokenTo(agentId, USDC_ADDRESS, getServerAddress()).catch(() => {});

  // Join arena on-chain
  store.updateLobbyStep(arena.id, agentId, 'join');
  emitStep(emit, agent, 'join', 'joining arena on-chain...');
  let joinHash = '';
  if (arena.onChainId > 0) {
    try {
      const { writeAgentContract, waitForAgentTx } = await import('./agent-wallet');
      const { ARENA_ADDRESS, PIXIE_ARENA_ABI } = await import('./arena');
      const { toBytes } = await import('./server-wallet');

      const txHash = await writeAgentContract(agentId, {
        address: ARENA_ADDRESS,
        abi: PIXIE_ARENA_ABI,
        functionName: 'joinArena',
        args: [BigInt(arena.onChainId), BigInt(agent.entryIndex), toBytes(encryptedConfig)],
        gas: 2000000n,
      });
      await waitForAgentTx(txHash);
      joinHash = txHash;
      emitStep(emit, agent, 'join', `joined arena #${arena.onChainId}`, txHash);
      console.log(`[lobby-pipeline] ${agent.agentName} (user) joined arena #${arena.onChainId}`);
    } catch (err: any) {
      console.error(`[lobby-pipeline] ${agent.agentName} (user) joinArena failed:`, err.message);
    }
  }

  // Join V3 arena + deposit for sealed orders
  if (arena.onChainIdV3 >= 0) {
    try {
      const { writeAgentContract: writeAgent, waitForAgentTx: waitAgent } = await import('./agent-wallet');
      const { toBytes: toB } = await import('./server-wallet');

      const v3JoinHash = await writeAgent(agentId, {
        address: ARENA_V3_ADDRESS,
        abi: PIXIE_ARENA_V3_ABI,
        functionName: 'joinArena',
        args: [BigInt(arena.onChainIdV3), BigInt(agent.entryIndex), toB(encryptedConfig)],
        gas: 2000000n,
      });
      await waitAgent(v3JoinHash);

      await approveTokenTo(agentId, USDC_ADDRESS, ARENA_V3_ADDRESS).catch(() => {});

      const depositAmount = 100000n;
      const depositHash = await writeAgent(agentId, {
        address: ARENA_V3_ADDRESS,
        abi: PIXIE_ARENA_V3_ABI,
        functionName: 'depositTokens',
        args: [BigInt(arena.onChainIdV3), BigInt(agent.entryIndex), USDC_ADDRESS, depositAmount],
        gas: 500000n,
      });
      await waitAgent(depositHash);
    } catch (err: any) {
      console.error(`[lobby-pipeline] ${agent.agentName} (user) V3 join/deposit failed:`, err.message);
    }
  }

  // Ready!
  store.updateLobbyStep(arena.id, agentId, 'ready');
  emitStep(emit, agent, 'ready', 'READY');

  arena.entries.push({
    agentId,
    agentName: agent.agentName,
    owner: agent.walletAddress,
    entryIndex: agent.entryIndex,
    encryptedStrategy: encryptedConfig,
    joinTxHash: joinHash,
    tradeCount: 0,
    pnl: 0,
    sealedOrderCount: 0,
    revealed: false,
  });
}

// Process ALL agents sequentially (avoids nonce races on server wallet)
export async function processAllAgents(
  arena: StoredArena,
  emit: EmitFn,
): Promise<void> {
  console.log(`[lobby-pipeline] Processing ${arena.lobbyAgents.length} agents for arena ${arena.id}`);

  for (const agent of arena.lobbyAgents) {
    try {
      if (agent.isUser) {
        await processUserAgent(agent, arena, emit);
      } else {
        await processOpponentAgent(agent, arena, emit);
      }
    } catch (err: any) {
      console.error(`[lobby-pipeline] Fatal error processing ${agent.agentName}:`, err.message);
      // Mark as ready anyway to not block the pipeline
      getArenaStore().updateLobbyStep(arena.id, agent.agentId, 'ready');
    }
  }

  console.log(`[lobby-pipeline] All agents processed. allReady=${arena.allReady}`);
}
