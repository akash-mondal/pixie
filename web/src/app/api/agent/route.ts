// Agent API route — Groq LLM + BITE encryption (runs server-side on Vercel)

import { NextRequest, NextResponse } from 'next/server';
import { encodeAbiParameters } from 'viem';

// --- Types ---
interface LPStrategy {
  tickLower: number;
  tickUpper: number;
  lockDays: number;
}

interface AgentResult {
  name: string;
  description: string;
  aiQuality: string;
  strategy: LPStrategy;
  reasoning: string;
  efficiency: number;
  ilRisk: string;
  encrypted: string;
}

// --- Simulated pool data (BITE sandbox has no live Algebra pools) ---
const POOL_DATA = {
  tick: 200340,
  fee: 500,
  tickSpacing: 60,
  token0: { symbol: 'USDC', decimals: 6 },
  token1: { symbol: 'WETH', decimals: 18 },
  tvlUSD: 2000000,
  volume24hUSD: 500000,
  fees24hUSD: 2500,
};

// --- Tick math ---
function suggestTickRange(currentTick: number, tickSpacing: number, widthMult: number) {
  const half = Math.floor(widthMult * tickSpacing);
  return {
    lower: Math.floor((currentTick - half) / tickSpacing) * tickSpacing,
    upper: Math.ceil((currentTick + half) / tickSpacing) * tickSpacing,
  };
}

function calcConcentration(currentTick: number, lower: number, upper: number) {
  const width = upper - lower;
  const efficiency = Math.round(1774544 / width);
  const ilRisk = width < 200 ? 'extreme' : width < 1000 ? 'high' : width < 3000 ? 'medium' : width < 20000 ? 'low' : 'very low';
  return { efficiency, ilRisk };
}

function buildContext() {
  const p = POOL_DATA;
  const apr = (p.fees24hUSD / p.tvlUSD) * 365 * 100;
  return `Algebra Finance ${p.token0.symbol}/${p.token1.symbol} Pool:
- Current tick: ${p.tick}
- Fee tier: ${(p.fee / 10000).toFixed(2)}%
- TVL: $${(p.tvlUSD / 1e6).toFixed(2)}M
- 24h Volume: $${(p.volume24hUSD / 1000).toFixed(0)}K
- Fee APR: ${apr.toFixed(1)}%
- Tick spacing: ${p.tickSpacing}`;
}

// --- Groq LLM ---
async function callGroq(instructions: string, input: string, reasoning: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const schema = {
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
  };

  const res = await fetch('https://api.groq.com/openai/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      instructions,
      input: [{ role: 'user', content: input }],
      reasoning: { effort: reasoning },
      text: { format: { type: 'json_schema', ...schema } },
    }),
  });

  if (!res.ok) {
    // Try fallback model
    const res2 = await fetch('https://api.groq.com/openai/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        instructions,
        input: [{ role: 'user', content: input }],
        text: { format: { type: 'json_schema', ...schema } },
      }),
    });
    if (!res2.ok) return null;
    const data2 = await res2.json();
    try { return JSON.parse(data2.output_text); } catch { return null; }
  }

  const data = await res.json();
  try { return JSON.parse(data.output_text); } catch { return null; }
}

// --- BITE encryption ---
let biteInstance: any = null;

async function encryptStrategy(strategy: LPStrategy): Promise<string> {
  const rpcUrl = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';

  if (!biteInstance) {
    const bite = await import('@skalenetwork/bite');
    const Cls = (bite as any).BITE || (bite as any).default?.BITE || (bite as any).default;
    biteInstance = new Cls(rpcUrl);
  }

  const encoded = encodeAbiParameters(
    [{ type: 'int24' }, { type: 'int24' }, { type: 'uint256' }],
    [strategy.tickLower, strategy.tickUpper, BigInt(strategy.lockDays)],
  );

  const hexData = encoded.startsWith('0x') ? encoded.slice(2) : encoded;
  return await biteInstance.encryptMessage(hexData);
}

// --- Agent personalities ---
const AGENTS: Record<string, { name: string; desc: string; quality: string; reasoning: string; fallbackWidth: number; fallbackLock: number; instructions: string }> = {
  alpha: {
    name: 'Alpha', desc: 'The Strategist', quality: 'HIGH', reasoning: 'high', fallbackWidth: 10, fallbackLock: 90,
    instructions: 'You are an expert concentrated liquidity strategist. Maximize fee capture while managing IL risk. Target 1000-2000 tick width. Ticks MUST be multiples of 60.',
  },
  beta: {
    name: 'Beta', desc: 'The Conservative', quality: 'LOW', reasoning: 'low', fallbackWidth: 33, fallbackLock: 30,
    instructions: 'You are a conservative LP advisor. Recommend a safe, wide tick range with short lock. Prioritize capital preservation. Ticks MUST be multiples of 60.',
  },
  gamma: {
    name: 'Gamma', desc: 'The Lazy Whale', quality: 'NONE', reasoning: 'none', fallbackWidth: 333, fallbackLock: 180,
    instructions: '',
  },
  delta: {
    name: 'Delta', desc: 'The Gambler', quality: 'NONE', reasoning: 'none', fallbackWidth: 1, fallbackLock: 7,
    instructions: '',
  },
  epsilon: {
    name: 'Epsilon', desc: 'The Balanced', quality: 'MEDIUM', reasoning: 'medium', fallbackWidth: 16, fallbackLock: 60,
    instructions: 'You are a balanced LP analyst. Find a middle ground between concentration and safety. Moderate lock duration. Ticks MUST be multiples of 60.',
  },
};

async function runAgent(agentType: string): Promise<AgentResult> {
  const agent = AGENTS[agentType];
  if (!agent) throw new Error(`Unknown agent: ${agentType}`);

  let strategy: LPStrategy;
  let reasoning: string;

  if (agent.quality !== 'NONE') {
    const context = buildContext();
    const parsed = await callGroq(agent.instructions, context + '\n\nRespond with a JSON LP strategy.', agent.reasoning);
    if (parsed) {
      strategy = { tickLower: parsed.tickLower, tickUpper: parsed.tickUpper, lockDays: parsed.lockDays };
      reasoning = parsed.reasoning;
    } else {
      const range = suggestTickRange(POOL_DATA.tick, POOL_DATA.tickSpacing, agent.fallbackWidth);
      strategy = { tickLower: range.lower, tickUpper: range.upper, lockDays: agent.fallbackLock };
      reasoning = 'Computed programmatically (LLM fallback).';
    }
  } else {
    const range = suggestTickRange(POOL_DATA.tick, POOL_DATA.tickSpacing, agent.fallbackWidth);
    strategy = { tickLower: range.lower, tickUpper: range.upper, lockDays: agent.fallbackLock };
    reasoning = agentType === 'gamma'
      ? 'Maximum lock, minimum effort. Ultra-wide range — set and forget.'
      : 'All-in on current price zone. Ultra-tight range — max risk.';
  }

  // Align ticks
  strategy.tickLower = Math.floor(strategy.tickLower / POOL_DATA.tickSpacing) * POOL_DATA.tickSpacing;
  strategy.tickUpper = Math.ceil(strategy.tickUpper / POOL_DATA.tickSpacing) * POOL_DATA.tickSpacing;
  if (strategy.tickUpper <= strategy.tickLower) strategy.tickUpper = strategy.tickLower + POOL_DATA.tickSpacing * 20;

  const conc = calcConcentration(POOL_DATA.tick, strategy.tickLower, strategy.tickUpper);

  // Encrypt with BITE
  const encrypted = await encryptStrategy(strategy);

  return {
    name: agent.name,
    description: agent.desc,
    aiQuality: agent.quality,
    strategy,
    reasoning,
    efficiency: conc.efficiency,
    ilRisk: conc.ilRisk,
    encrypted,
  };
}

// --- Route handler ---
export async function POST(req: NextRequest) {
  try {
    const { agentType } = await req.json();
    if (!agentType) return NextResponse.json({ error: 'agentType required' }, { status: 400 });

    const result = await runAgent(agentType.toLowerCase());
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Agent route error:', err);
    return NextResponse.json({ error: err.message || 'Agent run failed' }, { status: 500 });
  }
}
