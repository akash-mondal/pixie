// POST /api/agent/trade — Manual NL trade: prompt → LLM strategy → Algebra calldata → BITE encrypt

import { NextRequest, NextResponse } from 'next/server';
import { type AgentConfig, buildSystemPrompt } from '@/lib/agent-builder';
import { getMarketState, formatMarketContext } from '@/lib/algebra';
import { encryptSwapTransaction, encryptReasoning } from '@/lib/trade-engine';
import { type Address } from 'viem';

interface TradeRequest {
  prompt: string; // "Buy ETH aggressively with 1 USDC"
  agentConfig: AgentConfig;
  walletAddress: string;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, agentConfig, walletAddress }: TradeRequest = await req.json();

    if (!prompt || !agentConfig || !walletAddress) {
      return NextResponse.json({ error: 'prompt, agentConfig, walletAddress required' }, { status: 400 });
    }

    const systemPrompt = buildSystemPrompt(agentConfig);

    // Get market data for all agent's pairs
    const markets = agentConfig.tradingPairs.map(pair => getMarketState(pair));
    const marketContext = formatMarketContext(markets);

    // Call LLM for trade decision
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');

    const schema = {
      name: 'trade_decision',
      schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['swap', 'hold'] },
          pair: { type: 'string' },
          direction: { type: 'string', enum: ['buy', 'sell'] },
          amountUsdc: { type: 'number' },
          reasoning: { type: 'string' },
        },
        required: ['action', 'pair', 'direction', 'amountUsdc', 'reasoning'],
        additionalProperties: false,
      },
      strict: true,
    };

    const llmRes = await fetch('https://api.groq.com/openai/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        instructions: systemPrompt,
        input: [{ role: 'user', content: `MARKET:\n${marketContext}\n\nUSER COMMAND: ${prompt}\n\nExecute this trade. Respond with JSON.` }],
        reasoning: { effort: 'medium' },
        text: { format: { type: 'json_schema', ...schema } },
      }),
    });

    let decision;
    if (!llmRes.ok) {
      // Fallback
      const res2 = await fetch('https://api.groq.com/openai/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          instructions: systemPrompt,
          input: [{ role: 'user', content: `MARKET:\n${marketContext}\n\nUSER COMMAND: ${prompt}\n\nExecute this trade. Respond with JSON.` }],
          text: { format: { type: 'json_schema', ...schema } },
        }),
      });
      if (!res2.ok) throw new Error('LLM unavailable');
      const d2 = await res2.json();
      decision = JSON.parse(d2.output_text);
    } else {
      const data = await llmRes.json();
      decision = JSON.parse(data.output_text);
    }

    if (decision.action === 'hold') {
      return NextResponse.json({
        action: 'hold',
        reasoning: decision.reasoning,
        biteOps: 0,
      });
    }

    // Build + encrypt the swap
    const amountIn = BigInt(Math.round((decision.amountUsdc || 1) * 1e6));
    const { encrypted, calldata } = await encryptSwapTransaction({
      pair: decision.pair,
      direction: decision.direction,
      amountIn,
      recipient: walletAddress as Address,
    });

    // Encrypt reasoning
    const encryptedReasoningData = await encryptReasoning(decision.reasoning);

    return NextResponse.json({
      action: 'swap',
      pair: decision.pair,
      direction: decision.direction,
      amountUsdc: decision.amountUsdc,
      reasoning: decision.reasoning,
      calldata,
      encrypted,
      encryptedReasoning: encryptedReasoningData,
      biteOps: 2, // encryptTransaction + encryptReasoning
    });
  } catch (err: any) {
    console.error('Agent trade error:', err);
    return NextResponse.json({ error: err.message || 'Trade failed' }, { status: 500 });
  }
}
