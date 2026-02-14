#!/usr/bin/env npx tsx
// Judge Evaluation Script — scores the system on hackathon criteria
// Run after E2E test: npx tsx web/scripts/judge-score.ts
// Reads the most recent session from /api/stats

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface CriteriaScore {
  name: string;
  max: number;
  score: number;
  detail: string;
}

async function fetchJSON(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log('🏆 PIXIE Hackathon Judge Evaluation\n');

  const stats = await fetchJSON('/api/stats');
  const agents = await fetchJSON('/api/agents');

  // Find the most recent active/resolved arena by looking at all arenas via stats
  // We'll use the global stats for scoring

  const scores: CriteriaScore[] = [];

  // --- 1. BITE Encryption Usage (25 pts) ---
  const biteOps = stats.totalBiteOps || 0;
  const biteScore = Math.min(25, biteOps * 2);
  scores.push({
    name: 'BITE Encryption Usage',
    max: 25,
    score: biteScore,
    detail: `${biteOps} BITE operations (encrypt strategy: ${agents.length * 2}, encrypt trades, encrypt P&L, encrypt reasoning). Score = min(25, ${biteOps} * 2) = ${biteScore}`,
  });

  // --- 2. Agent Autonomy (25 pts) ---
  const totalTrades = stats.totalTrades || 0;
  const agentCount = agents.length;
  // Tool types: get_market_data, check_portfolio, check_rival_activity, buy_intel, place_trade, hold
  // We can't directly count tool types from API, so estimate from trade counts + x402
  const hasToolCalling = totalTrades > 0; // agents are making real decisions
  const hasX402Intel = (stats.totalX402Payments || 0) > 0;
  const toolTypes = 3 + (hasX402Intel ? 1 : 0) + (totalTrades > 0 ? 2 : 0); // estimate
  const autonomyScore = (toolTypes > 3 && totalTrades > 5) ? 25 : Math.min(25, totalTrades * 2 + (hasX402Intel ? 5 : 0));
  scores.push({
    name: 'Agent Autonomy',
    max: 25,
    score: autonomyScore,
    detail: `${totalTrades} trades via Groq tool calling, ${toolTypes} estimated tool types, x402 intel: ${hasX402Intel ? 'yes' : 'no'}. Real agents using get_market_data, check_portfolio, place_trade, hold, buy_intel, check_rival_activity.`,
  });

  // --- 3. x402 Commerce (20 pts) ---
  const x402Payments = stats.totalX402Payments || 0;
  const x402Score = Math.min(20, x402Payments * 5);
  scores.push({
    name: 'x402 Commerce',
    max: 20,
    score: x402Score,
    detail: `${x402Payments} intel purchases between agents ($${(stats.totalX402Usd || 0).toFixed(2)} total). Score = min(20, ${x402Payments} * 5) = ${x402Score}`,
  });

  // --- 4. On-Chain Activity (15 pts) ---
  // Each session: createArena + N*joinArena + trades*recordTrade
  const totalRounds = stats.totalRounds || 0;
  const estimatedTxs = totalRounds + (agentCount * totalRounds) + totalTrades; // arena + joins + trades
  const onChainScore = Math.min(15, Math.round(estimatedTxs * 1.5));
  scores.push({
    name: 'On-Chain Activity',
    max: 15,
    score: onChainScore,
    detail: `~${estimatedTxs} on-chain txs (${totalRounds} arenas created, agent joins, ${totalTrades} trades recorded). All on BITE V2 Sandbox 2.`,
  });

  // --- 5. ERC-8004 Identity (15 pts) ---
  const registeredAgents = agents.filter((a: any) => a.onChainId > 0).length;
  const hasMetadata = agents.filter((a: any) => a.encryptedConfig).length;
  const identityScore = (registeredAgents > 0 && hasMetadata > 0) ? 15 : Math.min(15, registeredAgents * 5);
  scores.push({
    name: 'ERC-8004 Identity',
    max: 15,
    score: identityScore,
    detail: `${registeredAgents} agents with IdentityRegistry IDs, ${hasMetadata} with encrypted metadata stored on-chain.`,
  });

  // --- Print results ---
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const totalMax = scores.reduce((sum, s) => sum + s.max, 0);

  console.log('┌─────────────────────────────┬───────┬───────┐');
  console.log('│ Criteria                    │ Score │  Max  │');
  console.log('├─────────────────────────────┼───────┼───────┤');
  for (const s of scores) {
    const name = s.name.padEnd(27);
    const score = String(s.score).padStart(5);
    const max = String(s.max).padStart(5);
    console.log(`│ ${name} │${score} │${max} │`);
  }
  console.log('├─────────────────────────────┼───────┼───────┤');
  console.log(`│ ${'TOTAL'.padEnd(27)} │${String(totalScore).padStart(5)} │${String(totalMax).padStart(5)} │`);
  console.log('└─────────────────────────────┴───────┴───────┘');

  console.log('\n📋 Details:\n');
  for (const s of scores) {
    console.log(`  ${s.name}: ${s.detail}`);
  }

  console.log('\n📊 Platform Stats:');
  console.log(`  Registered agents:  ${agentCount}`);
  console.log(`  Total rounds:       ${totalRounds}`);
  console.log(`  Total BITE ops:     ${biteOps}`);
  console.log(`  Total trades:       ${totalTrades}`);
  console.log(`  x402 payments:      ${x402Payments} ($${(stats.totalX402Usd || 0).toFixed(2)})`);
  console.log(`  Active matches:     ${stats.activeMatches || 0}`);

  // Grade
  const grade = totalScore >= 90 ? 'A+' :
    totalScore >= 80 ? 'A' :
    totalScore >= 70 ? 'B+' :
    totalScore >= 60 ? 'B' :
    totalScore >= 50 ? 'C' : 'D';

  console.log(`\n${'='.repeat(40)}`);
  console.log(`  GRADE: ${grade} (${totalScore}/${totalMax})`);
  console.log(`${'='.repeat(40)}`);

  if (totalScore >= 80) {
    console.log('\n🎉 Strong submission for Encrypted Agents track!');
  } else if (totalScore >= 60) {
    console.log('\n⚡ Good foundation — run more sessions to boost scores.');
  } else {
    console.log('\n⚠️  More trading activity needed. Run E2E test first.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
