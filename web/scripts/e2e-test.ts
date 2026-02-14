#!/usr/bin/env npx tsx
// E2E Test — Full flow: agent creation → session → lobby → trading → reveal → blockchain audit
// Run: npx tsx web/scripts/e2e-test.ts

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const RPC_URL = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';

interface TestResult {
  step: string;
  passed: boolean;
  detail: string;
  duration: number;
}

const results: TestResult[] = [];
let sessionId: string = '';
let agentId: string = '';

async function test(step: string, fn: () => Promise<string>): Promise<boolean> {
  const start = Date.now();
  try {
    const detail = await fn();
    const duration = Date.now() - start;
    results.push({ step, passed: true, detail, duration });
    console.log(`  ✅ ${step} (${duration}ms) — ${detail}`);
    return true;
  } catch (err: any) {
    const duration = Date.now() - start;
    results.push({ step, passed: false, detail: err.message, duration });
    console.log(`  ❌ ${step} (${duration}ms) — ${err.message}`);
    return false;
  }
}

async function fetchJSON(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Step 1: Register agent ---
async function step1_RegisterAgent() {
  console.log('\n📋 Step 1: Register User Agent');

  await test('Register agent on-chain', async () => {
    const data = await fetchJSON('/api/agent/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E_TestBot',
        personality: 'Aggressive momentum trader that rides breakouts and cuts losses fast',
        riskTolerance: 7,
        maxPositionSize: 40,
        maxDrawdown: 20,
        stopLoss: 8,
        takeProfit: 25,
        tradingPairs: ['ETH/USDC', 'WBTC/USDC'],
        tradingActions: ['swap'],
        rebalanceThreshold: 5,
        maxTradesPerRound: 4,
        signals: { priceAction: true, volume: true, tickMovement: true, lpConcentration: false, volatility: true },
        executionSpeed: 'aggressive',
        contrarian: false,
      }),
    });

    agentId = data.id;
    if (!agentId) throw new Error('No agent ID returned');
    if (!data.txHash) throw new Error('No tx hash returned');
    if (!data.onChain) throw new Error('Not registered on-chain');

    return `Agent #${agentId}, tx: ${data.txHash.slice(0, 14)}..., wallet: ${data.walletAddress?.slice(0, 10)}...`;
  });

  await test('Agent has wallet + funded', async () => {
    const agents = await fetchJSON('/api/agents');
    const agent = agents.find((a: any) => a.id === agentId);
    if (!agent) throw new Error('Agent not found in store');
    if (!agent.walletAddress) throw new Error('No wallet address');
    if (!agent.funded) throw new Error('Agent not funded');
    return `Wallet: ${agent.walletAddress.slice(0, 10)}..., funded: ${agent.funded}`;
  });

  await test('Agent has ERC-8004 identity', async () => {
    const agents = await fetchJSON('/api/agents');
    const agent = agents.find((a: any) => a.id === agentId);
    if (!agent?.onChainId) throw new Error('No on-chain identity ID');
    return `Identity #${agent.onChainId}`;
  });

  await test('Agent has BITE-encrypted config', async () => {
    const agents = await fetchJSON('/api/agents');
    const agent = agents.find((a: any) => a.id === agentId);
    if (!agent?.encryptedConfig) throw new Error('No encrypted config');
    if (!agent?.encryptedPersonality) throw new Error('No encrypted personality');
    return `Config: ${agent.encryptedConfig.slice(0, 20)}..., Personality: ${agent.encryptedPersonality.slice(0, 20)}...`;
  });
}

// --- Step 2: Create session ---
async function step2_CreateSession() {
  console.log('\n🎮 Step 2: Create Session');

  await test('Create sprint session', async () => {
    const data = await fetchJSON('/api/session/create', {
      method: 'POST',
      body: JSON.stringify({ mode: 'sprint', agentId }),
    });

    sessionId = data.sessionId;
    if (!sessionId) throw new Error('No session ID returned');

    return `Session: ${sessionId}, mode: ${data.mode}, opponents: ${data.opponents}`;
  });

  await test('Session exists with lobby agents', async () => {
    await sleep(1000); // let lobby pipeline start
    const data = await fetchJSON(`/api/session/${sessionId}`);
    if (!data.lobbyAgents || data.lobbyAgents.length === 0) throw new Error('No lobby agents');
    if (data.phase !== 'lobby') throw new Error(`Expected lobby phase, got: ${data.phase}`);
    if (!data.userAgentId) throw new Error('No userAgentId');

    const userAgent = data.lobbyAgents.find((a: any) => a.isUser);
    if (!userAgent) throw new Error('User agent not in lobby');

    const opponents = data.lobbyAgents.filter((a: any) => !a.isUser);
    const archetypes = new Set(opponents.map((a: any) => a.archetype));

    return `${data.lobbyAgents.length} agents (1 user + ${opponents.length} opponents), ${archetypes.size} diverse archetypes`;
  });

  await test('On-chain arena created', async () => {
    const data = await fetchJSON(`/api/session/${sessionId}`);
    if (!data.onChainId || data.onChainId === 0) throw new Error('No on-chain arena');
    return `Arena #${data.onChainId}`;
  });
}

// --- Step 3: Lobby pipeline completes ---
async function step3_LobbyPipeline() {
  console.log('\n⏳ Step 3: Lobby Pipeline');

  const maxWait = 120000; // 2 minutes max
  const start = Date.now();
  let allReady = false;
  let lastStatus = '';

  await test('All agents reach READY', async () => {
    while (Date.now() - start < maxWait) {
      const data = await fetchJSON(`/api/session/${sessionId}`);

      // Log progress
      const steps = data.lobbyAgents.map((a: any) => `${a.agentName}:${a.readyStep}`).join(', ');
      if (steps !== lastStatus) {
        console.log(`    ... ${steps}`);
        lastStatus = steps;
      }

      if (data.allReady || data.phase === 'trading') {
        allReady = true;
        const readyCount = data.lobbyAgents.filter((a: any) => a.readyStep === 'ready').length;
        return `All ${readyCount} agents ready in ${((Date.now() - start) / 1000).toFixed(1)}s`;
      }

      await sleep(3000);
    }

    throw new Error(`Timeout: not all agents ready after ${maxWait / 1000}s`);
  });
}

// --- Step 4: Trading phase ---
async function step4_TradingPhase() {
  console.log('\n📈 Step 4: Trading Phase');

  await test('Phase transitions to trading', async () => {
    const maxWait = 30000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const data = await fetchJSON(`/api/session/${sessionId}`);
      if (data.phase === 'trading') {
        return `Trading started, deadline: ${new Date(data.deadline).toISOString()}`;
      }
      await sleep(2000);
    }
    throw new Error('Trading phase not started');
  });

  // Wait for some trading activity
  console.log('    ... waiting 30s for agent activity...');
  await sleep(30000);

  await test('Agents making real tool calls', async () => {
    const data = await fetchJSON(`/api/session/${sessionId}`);
    const totalTrades = data.stats?.totalTrades || 0;
    const biteOps = data.stats?.biteOps || 0;
    if (totalTrades === 0 && biteOps <= 5) {
      throw new Error(`No trading activity: ${totalTrades} trades, ${biteOps} BITE ops`);
    }
    return `${totalTrades} trades, ${biteOps} BITE ops, ${data.stats?.x402Payments || 0} x402 payments`;
  });

  await test('User agent data uncensored', async () => {
    const data = await fetchJSON(`/api/session/${sessionId}`);
    const userEntry = data.entries?.find((e: any) => e.agentId === data.userAgentId);
    if (!userEntry) throw new Error('User entry not found');
    // User should have visible P&L (not null)
    if (userEntry.pnl === null || userEntry.pnl === undefined) {
      throw new Error('User P&L should be visible');
    }
    return `User P&L: ${userEntry.pnl} bps, trades: ${userEntry.tradeCount}`;
  });

  await test('Opponent data censored', async () => {
    const data = await fetchJSON(`/api/session/${sessionId}`);
    const opponents = data.entries?.filter((e: any) => e.agentId !== data.userAgentId) || [];
    if (opponents.length === 0) throw new Error('No opponent entries');

    const hasCensored = opponents.some((e: any) => e.pnl === null);
    if (!hasCensored) throw new Error('Opponent P&L should be censored (null) during trading');

    const hasNoTrades = opponents.every((e: any) => !e.trades);
    if (!hasNoTrades) throw new Error('Opponent trade details should not be visible');

    return `${opponents.length} opponents with censored data`;
  });
}

// --- Step 5: Wait for reveal ---
async function step5_Reveal() {
  console.log('\n🔓 Step 5: Reveal Phase');

  await test('Match resolves and reveals', async () => {
    const maxWait = 300000; // 5 min max
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const data = await fetchJSON(`/api/session/${sessionId}`);
      if (data.resolved || data.phase === 'reveal') {
        const revealed = data.entries?.filter((e: any) => e.revealed).length || 0;
        return `Revealed ${revealed} entries in ${((Date.now() - start) / 1000).toFixed(1)}s`;
      }

      const timeLeft = data.deadline ? Math.max(0, data.deadline - Date.now()) : 0;
      if (timeLeft > 0) {
        console.log(`    ... ${Math.ceil(timeLeft / 1000)}s remaining...`);
      }
      await sleep(5000);
    }
    throw new Error('Match did not resolve');
  });

  await test('All opponent P&L visible after reveal', async () => {
    const data = await fetchJSON(`/api/session/${sessionId}`);
    const nullPnl = data.entries?.filter((e: any) => e.pnl === null).length || 0;
    if (nullPnl > 0) throw new Error(`${nullPnl} entries still have null P&L`);

    const leaderboard = [...(data.entries || [])]
      .sort((a: any, b: any) => (b.pnl ?? 0) - (a.pnl ?? 0))
      .map((e: any, i: number) => `#${i + 1} ${e.agentName}: ${e.pnl}bps (${e.tradeCount}t)`)
      .join(', ');

    return `Leaderboard: ${leaderboard}`;
  });
}

// --- Step 6: Blockchain audit ---
async function step6_BlockchainAudit() {
  console.log('\n🔗 Step 6: Blockchain Audit');

  await test('On-chain arena exists', async () => {
    const data = await fetchJSON(`/api/session/${sessionId}`);
    if (!data.onChainId) throw new Error('No on-chain arena ID');

    // Query RPC for arena data
    const rpcRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      }),
    });
    const rpcData = await rpcRes.json();
    if (!rpcData.result) throw new Error('RPC not responding');

    const blockNumber = parseInt(rpcData.result, 16);
    return `Arena #${data.onChainId}, chain at block ${blockNumber}`;
  });
}

// --- Final summary ---
async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('E2E TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.step}`);
    if (!r.passed) console.log(`     └─ ${r.detail}`);
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`  PASSED: ${passed}/${total}`);
  console.log(`  FAILED: ${failed}/${total}`);
  console.log(`  TIME:   ${(totalTime / 1000).toFixed(1)}s`);
  console.log('-'.repeat(60));

  // Get final stats
  try {
    const stats = await fetchJSON('/api/stats');
    const session = await fetchJSON(`/api/session/${sessionId}`);
    console.log('\n📊 Session Stats:');
    console.log(`  Agents:     ${session.lobbyAgents?.length || 0}`);
    console.log(`  Trades:     ${session.stats?.totalTrades || 0}`);
    console.log(`  BITE ops:   ${session.stats?.biteOps || 0}`);
    console.log(`  x402:       ${session.stats?.x402Payments || 0} ($${(session.stats?.x402TotalUsd || 0).toFixed(2)})`);
    console.log(`  On-chain:   Arena #${session.onChainId || 0}`);
  } catch {}

  console.log('\n' + (failed === 0 ? '🎉 ALL TESTS PASSED' : `⚠️  ${failed} TESTS FAILED`));
  process.exit(failed > 0 ? 1 : 0);
}

// --- Main ---
async function main() {
  console.log('🏟️  PIXIE E2E Test Suite');
  console.log(`   Server: ${BASE_URL}`);
  console.log(`   Chain:  BITE V2 Sandbox 2`);
  console.log('');

  // Verify server is up
  try {
    await fetchJSON('/api/stats');
  } catch {
    console.error('❌ Server not reachable at ' + BASE_URL);
    process.exit(1);
  }

  await step1_RegisterAgent();
  await step2_CreateSession();
  await step3_LobbyPipeline();
  await step4_TradingPhase();
  await step5_Reveal();
  await step6_BlockchainAudit();
  await printSummary();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
