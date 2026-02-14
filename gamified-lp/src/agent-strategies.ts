// 5 Agent Personalities — varying AI quality for LP strategy selection

import { callLLM } from './llm-client.js';
import {
  type PoolData,
  suggestTickRange,
  calculateLPConcentration,
  buildAlgebraContext,
  feeAPR,
} from './algebra-data.js';
import type { LPStrategy } from './bite-client.js';

export interface AgentResult {
  name: string;
  description: string;
  aiQuality: string;
  strategy: LPStrategy;
  reasoning: string;
  efficiency: number;
  ilRisk: string;
  depositAmount: number; // in USDC (human-readable)
}

// --- Alpha: The Strategist (HIGH reasoning, best AI) ---
export async function alphaAgent(pool: PoolData): Promise<AgentResult> {
  const context = buildAlgebraContext(pool);
  const apr = feeAPR(pool.fees24hUSD, pool.tvlUSD);

  const result = await callLLM({
    instructions: `You are an expert concentrated liquidity strategist. Analyze the Algebra Finance pool data and recommend an optimal LP strategy.

Your goal: Maximize fee capture while managing impermanent loss (IL) risk.
Rules:
- tickLower and tickUpper MUST be multiples of the pool's tickSpacing (${pool.tickSpacing})
- Concentrate around the current tick for maximum efficiency
- Consider: fee APR, IL risk, tick spacing alignment
- Lock duration should balance commitment reward vs opportunity cost
- Target 1000-2000 tick width for good efficiency/risk tradeoff`,
    input: `${context}

Respond with a JSON strategy. Consider that the fee APR is ${apr.toFixed(1)}%, suggesting ${apr > 30 ? 'high activity worth concentrating on' : 'moderate activity'}.`,
    reasoning: 'high',
    jsonSchema: {
      name: 'lp_strategy',
      schema: {
        type: 'object',
        properties: {
          tickLower: { type: 'number' },
          tickUpper: { type: 'number' },
          lockDays: { type: 'number' },
          reasoning: { type: 'string' },
        },
        required: ['tickLower', 'tickUpper', 'lockDays', 'reasoning'],
        additionalProperties: false,
      },
      strict: true,
    },
  });

  let strategy: LPStrategy;
  let reasoning: string;

  if (result.parsed) {
    strategy = {
      tickLower: result.parsed.tickLower,
      tickUpper: result.parsed.tickUpper,
      lockDays: result.parsed.lockDays,
    };
    reasoning = result.parsed.reasoning;
  } else {
    // Fallback: compute good strategy programmatically
    const range = suggestTickRange(pool.tick, pool.tickSpacing, 10);
    strategy = { tickLower: range.lower, tickUpper: range.upper, lockDays: 90 };
    reasoning = 'Tight range near active tick, 90d lock for reward optimization.';
  }

  // Ensure tick alignment
  strategy.tickLower = Math.floor(strategy.tickLower / pool.tickSpacing) * pool.tickSpacing;
  strategy.tickUpper = Math.ceil(strategy.tickUpper / pool.tickSpacing) * pool.tickSpacing;
  if (strategy.tickUpper <= strategy.tickLower) strategy.tickUpper = strategy.tickLower + pool.tickSpacing * 20;

  const conc = calculateLPConcentration(pool.tick, strategy.tickLower, strategy.tickUpper);

  return {
    name: 'Alpha',
    description: 'The Strategist',
    aiQuality: 'HIGH',
    strategy,
    reasoning,
    efficiency: conc.efficiency,
    ilRisk: conc.ilRisk,
    depositAmount: 0.20,
  };
}

// --- Beta: The Conservative (LOW reasoning) ---
export async function betaAgent(pool: PoolData): Promise<AgentResult> {
  const context = buildAlgebraContext(pool);

  const result = await callLLM({
    instructions: 'You are a conservative LP advisor. Recommend a safe, wide tick range with short lock. Prioritize capital preservation over fee maximization.',
    input: `${context}\n\nGive a conservative LP strategy. Use wide range for safety.`,
    reasoning: 'low',
    jsonSchema: {
      name: 'conservative_strategy',
      schema: {
        type: 'object',
        properties: {
          tickLower: { type: 'number' },
          tickUpper: { type: 'number' },
          lockDays: { type: 'number' },
          reasoning: { type: 'string' },
        },
        required: ['tickLower', 'tickUpper', 'lockDays', 'reasoning'],
        additionalProperties: false,
      },
      strict: true,
    },
  });

  let strategy: LPStrategy;
  let reasoning: string;

  if (result.parsed) {
    strategy = {
      tickLower: result.parsed.tickLower,
      tickUpper: result.parsed.tickUpper,
      lockDays: result.parsed.lockDays,
    };
    reasoning = result.parsed.reasoning;
  } else {
    const range = suggestTickRange(pool.tick, pool.tickSpacing, 33);
    strategy = { tickLower: range.lower, tickUpper: range.upper, lockDays: 30 };
    reasoning = 'Wide range for safety, short lock to preserve optionality.';
  }

  strategy.tickLower = Math.floor(strategy.tickLower / pool.tickSpacing) * pool.tickSpacing;
  strategy.tickUpper = Math.ceil(strategy.tickUpper / pool.tickSpacing) * pool.tickSpacing;
  if (strategy.tickUpper <= strategy.tickLower) strategy.tickUpper = strategy.tickLower + pool.tickSpacing * 66;

  const conc = calculateLPConcentration(pool.tick, strategy.tickLower, strategy.tickUpper);

  return {
    name: 'Beta',
    description: 'The Conservative',
    aiQuality: 'LOW',
    strategy,
    reasoning,
    efficiency: conc.efficiency,
    ilRisk: conc.ilRisk,
    depositAmount: 0.20,
  };
}

// --- Gamma: The Lazy Whale (No LLM, hardcoded ultra-wide) ---
export async function gammaAgent(pool: PoolData): Promise<AgentResult> {
  const strategy: LPStrategy = {
    tickLower: Math.floor((pool.tick - 20000) / pool.tickSpacing) * pool.tickSpacing,
    tickUpper: Math.ceil((pool.tick + 20000) / pool.tickSpacing) * pool.tickSpacing,
    lockDays: 180,
  };

  const conc = calculateLPConcentration(pool.tick, strategy.tickLower, strategy.tickUpper);

  return {
    name: 'Gamma',
    description: 'The Lazy Whale',
    aiQuality: 'NONE',
    strategy,
    reasoning: 'Maximum lock, minimum effort. Ultra-wide range — set and forget.',
    efficiency: conc.efficiency,
    ilRisk: conc.ilRisk,
    depositAmount: 0.20,
  };
}

// --- Delta: The Gambler (No LLM, hardcoded ultra-tight) ---
export async function deltaAgent(pool: PoolData): Promise<AgentResult> {
  const strategy: LPStrategy = {
    tickLower: Math.floor((pool.tick - 60) / pool.tickSpacing) * pool.tickSpacing,
    tickUpper: Math.ceil((pool.tick + 60) / pool.tickSpacing) * pool.tickSpacing,
    lockDays: 7,
  };

  const conc = calculateLPConcentration(pool.tick, strategy.tickLower, strategy.tickUpper);

  return {
    name: 'Delta',
    description: 'The Gambler',
    aiQuality: 'NONE',
    strategy,
    reasoning: 'All-in on current price zone. Ultra-tight range, 7d lock — max risk.',
    efficiency: conc.efficiency,
    ilRisk: conc.ilRisk,
    depositAmount: 0.20,
  };
}

// --- Epsilon: The Balanced (MEDIUM reasoning) ---
export async function epsilonAgent(pool: PoolData): Promise<AgentResult> {
  const context = buildAlgebraContext(pool);

  const result = await callLLM({
    instructions: 'You are a balanced LP analyst. Find a middle ground between concentration and safety. Moderate lock duration.',
    input: `${context}\n\nGive a balanced LP strategy with moderate risk.`,
    reasoning: 'medium',
    jsonSchema: {
      name: 'balanced_strategy',
      schema: {
        type: 'object',
        properties: {
          tickLower: { type: 'number' },
          tickUpper: { type: 'number' },
          lockDays: { type: 'number' },
          reasoning: { type: 'string' },
        },
        required: ['tickLower', 'tickUpper', 'lockDays', 'reasoning'],
        additionalProperties: false,
      },
      strict: true,
    },
  });

  let strategy: LPStrategy;
  let reasoning: string;

  if (result.parsed) {
    strategy = {
      tickLower: result.parsed.tickLower,
      tickUpper: result.parsed.tickUpper,
      lockDays: result.parsed.lockDays,
    };
    reasoning = result.parsed.reasoning;
  } else {
    const range = suggestTickRange(pool.tick, pool.tickSpacing, 16);
    strategy = { tickLower: range.lower, tickUpper: range.upper, lockDays: 60 };
    reasoning = 'Balanced range with moderate lock — good efficiency with manageable risk.';
  }

  strategy.tickLower = Math.floor(strategy.tickLower / pool.tickSpacing) * pool.tickSpacing;
  strategy.tickUpper = Math.ceil(strategy.tickUpper / pool.tickSpacing) * pool.tickSpacing;
  if (strategy.tickUpper <= strategy.tickLower) strategy.tickUpper = strategy.tickLower + pool.tickSpacing * 32;

  const conc = calculateLPConcentration(pool.tick, strategy.tickLower, strategy.tickUpper);

  return {
    name: 'Epsilon',
    description: 'The Balanced',
    aiQuality: 'MEDIUM',
    strategy,
    reasoning,
    efficiency: conc.efficiency,
    ilRisk: conc.ilRisk,
    depositAmount: 0.20,
  };
}
