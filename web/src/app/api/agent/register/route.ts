// POST /api/agent/register — Create agent: BITE encrypt → IdentityRegistry on-chain → wallet + fund

import { NextRequest, NextResponse } from 'next/server';
import { type AgentConfig, buildSystemPrompt, serializeConfig } from '@/lib/agent-builder';
import { encryptStrategy } from '@/lib/trade-engine';
import { writeServerContract, waitForTx, parseEvent, getServerAddress } from '@/lib/server-wallet';
import { IDENTITY_REGISTRY, IDENTITY_ABI, getAgentCount } from '@/lib/identity';
import { getAgentStore } from '@/lib/agent-store';
import { createAgentWallet, fundAgentSfuel, fundAgentWallet, getAgentAddress } from '@/lib/agent-wallet';
import { initMemory } from '@/lib/agent-memory';

export async function POST(req: NextRequest) {
  try {
    const config: AgentConfig = await req.json();

    if (!config.name || !config.personality) {
      return NextResponse.json({ error: 'name and personality required' }, { status: 400 });
    }

    // 1. Build LLM system prompt from config
    const systemPrompt = buildSystemPrompt(config);

    // 2. Serialize full config for encryption
    const configJson = serializeConfig(config);

    // 3. BITE-encrypt the personality + config (REAL BITE operations)
    console.log(`[register] BITE encrypting config for ${config.name}...`);
    const encryptedConfig = await encryptStrategy(configJson);
    const encryptedPersonality = await encryptStrategy(systemPrompt);

    // 4. Build agent URI for on-chain storage
    const agentURI = JSON.stringify({
      name: config.name,
      personality: config.personality.slice(0, 100),
      risk: config.riskTolerance,
      pairs: config.tradingPairs,
    });

    // 5. Read agentCount before registration (to determine new ID)
    const countBefore = await getAgentCount();

    // 6. Register on IdentityRegistry via server wallet (REAL ON-CHAIN TX)
    console.log(`[register] Registering ${config.name} on IdentityRegistry (count before: ${countBefore})...`);
    const txHash = await writeServerContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: 'registerWithURI',
      args: [agentURI],
      gas: 500000n,
    });

    // 7. Wait for receipt + parse event
    const receipt = await waitForTx(txHash);

    let agentId: number;
    const eventArgs = parseEvent(receipt, IDENTITY_ABI as any, 'Registered');
    if (eventArgs?.agentId !== undefined) {
      agentId = Number(eventArgs.agentId);
    } else {
      const countAfter = await getAgentCount();
      agentId = countAfter;
    }

    console.log(`[register] ${config.name} registered as agent #${agentId}, tx: ${txHash}`);

    // 8. Create agent wallet + fund sFUEL + USDC
    const agentKey = String(agentId);
    createAgentWallet(agentKey);
    const walletAddress = getAgentAddress(agentKey);
    initMemory(agentKey, config.name);

    // Fund in background (don't block response)
    let funded = false;
    try {
      await fundAgentSfuel(agentKey);
      await fundAgentWallet(agentKey, 0.50);
      funded = true;
      console.log(`[register] ${config.name} wallet funded — ${walletAddress}`);
    } catch (err: any) {
      console.error(`[register] ${config.name} funding failed:`, err.message);
    }

    // 9. Cache in agent store
    const stored = {
      id: agentKey,
      onChainId: agentId,
      name: config.name,
      personality: config.personality,
      config,
      encryptedConfig,
      encryptedPersonality,
      owner: getServerAddress(),
      walletAddress,
      funded,
      registeredAt: Date.now(),
      txHash,
      arenaCount: 0,
      totalTrades: 0,
    };
    getAgentStore().add(stored);

    return NextResponse.json({
      ...stored,
      encryptedConfig: encryptedConfig.slice(0, 40) + '...',
      encryptedPersonality: encryptedPersonality.slice(0, 40) + '...',
      biteOps: 2,
      onChain: true,
    });
  } catch (err: any) {
    console.error('Agent register error:', err);
    return NextResponse.json({ error: err.message || 'Registration failed' }, { status: 500 });
  }
}
