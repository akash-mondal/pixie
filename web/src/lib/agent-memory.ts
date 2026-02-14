// Agent Memory System — short-term (per round) + long-term (across rounds)
// Injected into LLM prompts so agents make decisions based on experience
// NOT scripted — agents autonomously learn and adapt via LLM reasoning

export interface ShortTermMemory {
  roundNumber: number;
  trades: Array<{
    pair: string;
    direction: 'buy' | 'sell';
    amountPercent: number;
    reasoning: string;
    pnlBps: number;
  }>;
  intelPurchased: Array<{
    fromAgentId: string;
    fromAgentName: string;
    analysis: string;
    direction: string;
    wasAccurate: boolean | null; // null = not yet evaluated
  }>;
  intelSold: Array<{
    toAgentId: string;
    toAgentName: string;
    price: number;
  }>;
  marketConditions: string;
  totalPnl: number;
  rank: number | null;
}

export interface AgentRelationship {
  agentId: string;
  agentName: string;
  trustScore: number;         // 0-5 scale
  intelPurchased: number;     // how many times bought from them
  intelAccurate: number;      // how many times their intel was correct
  intelInaccurate: number;    // how many times their intel was wrong
  lastInteraction: number;    // timestamp
}

export interface LongTermMemory {
  agentId: string;
  agentName: string;

  // Performance stats
  roundsPlayed: number;
  roundsWon: number;
  totalPnl: number;           // cumulative bps
  bestRound: number;          // highest single-round bps
  worstRound: number;         // lowest single-round bps
  totalTrades: number;

  // Pair performance
  pairStats: Record<string, {
    trades: number;
    totalPnl: number;
    wins: number;
    losses: number;
  }>;

  // Lessons learned (LLM-generated strings)
  lessons: string[];

  // Relationships with other agents
  relationships: Map<string, AgentRelationship>;

  // x402 commerce
  x402Spent: number;          // total USDC spent buying intel
  x402Earned: number;         // total USDC earned selling intel

  // Intel reputation (ratings received from others)
  reputationScores: number[]; // array of ratings 1-5
  reputationAvg: number;      // average rating

  // Strategy adjustments log
  adjustments: Array<{
    round: number;
    field: string;
    oldValue: any;
    newValue: any;
    reason: string;
    timestamp: number;
  }>;

  // User instructions (if any, set by agent owner)
  userInstructions: string | null;

  // Budget settings (user-controlled)
  budgetPerRound: number;     // max x402 spend per round (USDC)
  sellingPreference: 'always' | 'selective' | 'never';
  strategyLocked: boolean;    // if true, agent won't auto-adjust config

  // Recent rounds (last 5)
  recentRounds: ShortTermMemory[];
}

// --- Global store (persists across HMR in dev) ---

const g = globalThis as any;

function getMemoryStore(): Map<string, LongTermMemory> {
  if (!g.__pixieAgentMemory) g.__pixieAgentMemory = new Map<string, LongTermMemory>();
  return g.__pixieAgentMemory;
}

// Initialize memory for a new agent
export function initMemory(agentId: string, agentName: string): LongTermMemory {
  const store = getMemoryStore();
  const existing = store.get(agentId);
  if (existing) return existing;

  const memory: LongTermMemory = {
    agentId,
    agentName,
    roundsPlayed: 0,
    roundsWon: 0,
    totalPnl: 0,
    bestRound: 0,
    worstRound: 0,
    totalTrades: 0,
    pairStats: {},
    lessons: [],
    relationships: new Map(),
    x402Spent: 0,
    x402Earned: 0,
    reputationScores: [],
    reputationAvg: 0,
    adjustments: [],
    userInstructions: null,
    budgetPerRound: 0.25,
    sellingPreference: 'always',
    strategyLocked: false,
    recentRounds: [],
  };

  store.set(agentId, memory);
  return memory;
}

export function getMemory(agentId: string): LongTermMemory | undefined {
  return getMemoryStore().get(agentId);
}

// Record a completed round
export function recordRound(agentId: string, round: ShortTermMemory) {
  const memory = getMemoryStore().get(agentId);
  if (!memory) return;

  memory.roundsPlayed++;
  memory.totalPnl += round.totalPnl;
  memory.totalTrades += round.trades.length;

  if (round.totalPnl > memory.bestRound) memory.bestRound = round.totalPnl;
  if (round.totalPnl < memory.worstRound) memory.worstRound = round.totalPnl;

  if (round.rank === 1) memory.roundsWon++;

  // Update pair stats
  for (const trade of round.trades) {
    if (!memory.pairStats[trade.pair]) {
      memory.pairStats[trade.pair] = { trades: 0, totalPnl: 0, wins: 0, losses: 0 };
    }
    const ps = memory.pairStats[trade.pair];
    ps.trades++;
    ps.totalPnl += trade.pnlBps;
    if (trade.pnlBps > 0) ps.wins++;
    else if (trade.pnlBps < 0) ps.losses++;
  }

  // Keep last 5 rounds
  memory.recentRounds.push(round);
  if (memory.recentRounds.length > 5) memory.recentRounds.shift();
}

// Record an intel purchase
export function recordIntelPurchase(agentId: string, fromAgentId: string, fromAgentName: string, amount: number) {
  const memory = getMemoryStore().get(agentId);
  if (!memory) return;

  memory.x402Spent += amount;

  // Update relationship
  let rel = memory.relationships.get(fromAgentId);
  if (!rel) {
    rel = {
      agentId: fromAgentId,
      agentName: fromAgentName,
      trustScore: 3.0,
      intelPurchased: 0,
      intelAccurate: 0,
      intelInaccurate: 0,
      lastInteraction: Date.now(),
    };
    memory.relationships.set(fromAgentId, rel);
  }
  rel.intelPurchased++;
  rel.lastInteraction = Date.now();
}

// Record an intel sale
export function recordIntelSale(agentId: string, toAgentId: string, toAgentName: string, amount: number) {
  const memory = getMemoryStore().get(agentId);
  if (!memory) return;

  memory.x402Earned += amount;
}

// Rate intel from another agent (called after round results known)
export function rateIntel(agentId: string, fromAgentId: string, accurate: boolean) {
  const memory = getMemoryStore().get(agentId);
  if (!memory) return;

  const rel = memory.relationships.get(fromAgentId);
  if (!rel) return;

  if (accurate) {
    rel.intelAccurate++;
  } else {
    rel.intelInaccurate++;
  }

  // Update trust score (0-5 scale)
  const total = rel.intelAccurate + rel.intelInaccurate;
  rel.trustScore = total > 0 ? (rel.intelAccurate / total) * 5 : 3.0;
}

// Receive a reputation rating from another agent
export function receiveRating(agentId: string, rating: number) {
  const memory = getMemoryStore().get(agentId);
  if (!memory) return;

  memory.reputationScores.push(Math.max(1, Math.min(5, rating)));
  memory.reputationAvg = memory.reputationScores.reduce((a, b) => a + b, 0) / memory.reputationScores.length;
}

// Record a strategy adjustment
export function recordAdjustment(
  agentId: string,
  round: number,
  field: string,
  oldValue: any,
  newValue: any,
  reason: string,
) {
  const memory = getMemoryStore().get(agentId);
  if (!memory) return;

  memory.adjustments.push({ round, field, oldValue, newValue, reason, timestamp: Date.now() });
  // Keep last 20 adjustments
  if (memory.adjustments.length > 20) memory.adjustments.shift();
}

// Add a lesson learned
export function addLesson(agentId: string, lesson: string) {
  const memory = getMemoryStore().get(agentId);
  if (!memory) return;

  memory.lessons.push(lesson);
  // Keep last 10 lessons
  if (memory.lessons.length > 10) memory.lessons.shift();
}

// Update user settings
export function updateSettings(
  agentId: string,
  settings: {
    budgetPerRound?: number;
    sellingPreference?: 'always' | 'selective' | 'never';
    strategyLocked?: boolean;
    userInstructions?: string | null;
  },
) {
  const memory = getMemoryStore().get(agentId);
  if (!memory) return;

  if (settings.budgetPerRound !== undefined) memory.budgetPerRound = settings.budgetPerRound;
  if (settings.sellingPreference !== undefined) memory.sellingPreference = settings.sellingPreference;
  if (settings.strategyLocked !== undefined) memory.strategyLocked = settings.strategyLocked;
  if (settings.userInstructions !== undefined) memory.userInstructions = settings.userInstructions;
}

// --- Format memory for LLM injection ---

export function formatMemoryForPrompt(agentId: string): string {
  const memory = getMemoryStore().get(agentId);
  if (!memory || memory.roundsPlayed === 0) return '';

  const winRate = memory.roundsPlayed > 0
    ? ((memory.roundsWon / memory.roundsPlayed) * 100).toFixed(0)
    : '0';

  const avgPnl = memory.roundsPlayed > 0
    ? (memory.totalPnl / memory.roundsPlayed).toFixed(0)
    : '0';

  // Best pair
  let bestPair = 'none';
  let bestPairPnl = -Infinity;
  for (const [pair, stats] of Object.entries(memory.pairStats)) {
    if (stats.totalPnl > bestPairPnl) {
      bestPairPnl = stats.totalPnl;
      bestPair = `${pair} (${stats.totalPnl > 0 ? '+' : ''}${stats.totalPnl}bps over ${stats.trades} trades)`;
    }
  }

  // Trusted sources
  const trustedSources: string[] = [];
  const untrustedSources: string[] = [];
  for (const [, rel] of memory.relationships) {
    if (rel.trustScore >= 3.5 && rel.intelPurchased >= 2) {
      trustedSources.push(`${rel.agentName} (trust: ${rel.trustScore.toFixed(1)}/5, accurate ${rel.intelAccurate}/${rel.intelPurchased})`);
    } else if (rel.trustScore < 2.5 && rel.intelPurchased >= 2) {
      untrustedSources.push(`${rel.agentName} (trust: ${rel.trustScore.toFixed(1)}/5 — avoid buying)`);
    }
  }

  // Recent lessons
  const recentLessons = memory.lessons.slice(-3);

  // Last round
  const lastRound = memory.recentRounds[memory.recentRounds.length - 1];
  let lastRoundSummary = '';
  if (lastRound) {
    const trades = lastRound.trades.map(t =>
      `${t.direction} ${t.pair} → ${t.pnlBps > 0 ? '+' : ''}${t.pnlBps}bps`
    ).join(', ');
    lastRoundSummary = `\nLAST ROUND: ${trades || 'held'} | Total: ${lastRound.totalPnl > 0 ? '+' : ''}${lastRound.totalPnl}bps | Rank: #${lastRound.rank ?? '?'}`;
  }

  // User instructions
  const userInstr = memory.userInstructions
    ? `\nUSER INSTRUCTIONS: ${memory.userInstructions}`
    : '';

  return `
LONG-TERM MEMORY:
- Rounds: ${memory.roundsPlayed} played, ${memory.roundsWon} won (${winRate}% win rate)
- Avg P&L: ${avgPnl}bps/round | Best: +${memory.bestRound}bps | Worst: ${memory.worstRound}bps
- Best pair: ${bestPair}
- Intel reputation: ${memory.reputationAvg.toFixed(1)}/5 (${memory.reputationScores.length} reviews)
- x402 economy: $${memory.x402Spent.toFixed(2)} spent, $${memory.x402Earned.toFixed(2)} earned
${trustedSources.length > 0 ? `- Trusted intel: ${trustedSources.join(', ')}` : ''}
${untrustedSources.length > 0 ? `- Avoid intel from: ${untrustedSources.join(', ')}` : ''}
${recentLessons.length > 0 ? `- Lessons: ${recentLessons.map(l => `"${l}"`).join(' | ')}` : ''}${lastRoundSummary}${userInstr}`.trim();
}

// Get stats for agent profile card
export function getAgentStats(agentId: string) {
  const memory = getMemoryStore().get(agentId);
  if (!memory) {
    return {
      roundsPlayed: 0, roundsWon: 0, winRate: 0, totalPnl: 0, avgPnl: 0,
      totalTrades: 0, bestRound: 0, worstRound: 0,
      x402Spent: 0, x402Earned: 0, reputationAvg: 0, reputationCount: 0,
      streak: 0, favoritePair: 'none',
    };
  }

  // Calculate streak
  let streak = 0;
  const rounds = memory.recentRounds;
  if (rounds.length > 0) {
    const lastWon = rounds[rounds.length - 1].rank === 1;
    for (let i = rounds.length - 1; i >= 0; i--) {
      const won = rounds[i].rank === 1;
      if (won === lastWon) streak++;
      else break;
    }
    if (!lastWon) streak = -streak;
  }

  // Favorite pair
  let favoritePair = 'none';
  let maxTrades = 0;
  for (const [pair, stats] of Object.entries(memory.pairStats)) {
    if (stats.trades > maxTrades) {
      maxTrades = stats.trades;
      favoritePair = pair;
    }
  }

  return {
    roundsPlayed: memory.roundsPlayed,
    roundsWon: memory.roundsWon,
    winRate: memory.roundsPlayed > 0 ? (memory.roundsWon / memory.roundsPlayed) * 100 : 0,
    totalPnl: memory.totalPnl,
    avgPnl: memory.roundsPlayed > 0 ? memory.totalPnl / memory.roundsPlayed : 0,
    totalTrades: memory.totalTrades,
    bestRound: memory.bestRound,
    worstRound: memory.worstRound,
    x402Spent: memory.x402Spent,
    x402Earned: memory.x402Earned,
    reputationAvg: memory.reputationAvg,
    reputationCount: memory.reputationScores.length,
    streak,
    favoritePair,
  };
}

// Get all memories (for debugging)
export function getAllMemories(): Map<string, LongTermMemory> {
  return getMemoryStore();
}
