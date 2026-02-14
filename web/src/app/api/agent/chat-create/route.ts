// POST /api/agent/chat-create — Natural language → AgentConfig via LLM

import { NextRequest, NextResponse } from 'next/server';
import { type AgentConfig, DEFAULT_AGENT_CONFIG } from '@/lib/agent-builder';
import { getTemplate, AGENT_TEMPLATES } from '@/lib/agent-templates';

export async function POST(req: NextRequest) {
  try {
    const { prompt, templateId } = await req.json();

    if (!prompt && !templateId) {
      return NextResponse.json({ error: 'Provide a prompt or templateId' }, { status: 400 });
    }

    // If using a template as base
    let baseConfig = { ...DEFAULT_AGENT_CONFIG };
    if (templateId) {
      const template = getTemplate(templateId);
      if (template) {
        baseConfig = { ...template.config };
      }
    }

    // If no prompt, just return the template config
    if (!prompt && templateId) {
      const template = getTemplate(templateId);
      return NextResponse.json({
        config: baseConfig,
        summary: template
          ? `${template.emoji} ${template.name} — ${template.tagline}`
          : 'Template agent ready',
      });
    }

    // Call Groq LLM to parse natural language into AgentConfig
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
    }

    const templateNames = AGENT_TEMPLATES.map(t => `${t.name}: ${t.tagline}`).join(', ');

    const schema = {
      name: 'agent_config',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          personality: { type: 'string' },
          riskTolerance: { type: 'number' },
          maxPositionSize: { type: 'number' },
          maxDrawdown: { type: 'number' },
          stopLoss: { type: 'number' },
          takeProfit: { type: 'number' },
          tradingPairs: { type: 'array', items: { type: 'string' } },
          tradingActions: { type: 'array', items: { type: 'string' } },
          rebalanceThreshold: { type: 'number' },
          maxTradesPerRound: { type: 'number' },
          signals: {
            type: 'object',
            properties: {
              priceAction: { type: 'boolean' },
              volume: { type: 'boolean' },
              tickMovement: { type: 'boolean' },
              lpConcentration: { type: 'boolean' },
              volatility: { type: 'boolean' },
            },
            required: ['priceAction', 'volume', 'tickMovement', 'lpConcentration', 'volatility'],
            additionalProperties: false,
          },
          executionSpeed: { type: 'string', enum: ['patient', 'moderate', 'aggressive'] },
          contrarian: { type: 'boolean' },
          summary: { type: 'string' },
        },
        required: ['name', 'personality', 'riskTolerance', 'maxPositionSize', 'maxDrawdown', 'stopLoss', 'takeProfit', 'tradingPairs', 'tradingActions', 'rebalanceThreshold', 'maxTradesPerRound', 'signals', 'executionSpeed', 'contrarian', 'summary'],
        additionalProperties: false,
      },
      strict: true,
    };

    const systemPrompt = `You are an AI trading agent builder for PIXIE, an encrypted agent trading arena on SKALE blockchain.

Given a user's natural language description, generate a complete trading agent configuration.

Available templates for reference: ${templateNames}

RULES:
- name: Creative, memorable 1-3 word name
- personality: Rich 1-2 sentence personality description
- riskTolerance: 1-10 (1=ultra conservative, 10=full degen)
- maxPositionSize: 5-100 (% of portfolio per trade)
- maxDrawdown: 5-50 (% total loss before stopping)
- stopLoss: 1-25 (% per trade)
- takeProfit: 2-100 (% per trade)
- tradingPairs: Array from ["ETH/USDC", "WBTC/USDC", "ETH/WBTC"]
- tradingActions: Array from ["swap"]
- rebalanceThreshold: 1-20 (%)
- maxTradesPerRound: 1-10
- executionSpeed: "patient" | "moderate" | "aggressive"
- contrarian: true if they want to go against trends
- summary: One-line description of the agent (for UI display)

Match the user's vibe. If they say "aggressive", go high risk. If they say "safe", go conservative.`;

    const body = {
      model: 'openai/gpt-oss-120b',
      instructions: systemPrompt,
      input: [{
        role: 'user',
        content: templateId
          ? `Start from the "${getTemplate(templateId)?.name}" template and modify it based on: "${prompt}"`
          : `Create a trading agent based on this description: "${prompt}"`,
      }],
      reasoning: { effort: 'medium' },
      text: { format: { type: 'json_schema', ...schema } },
    };

    // Extract output_text from Groq Responses API (nested in output array)
    function extractText(data: any): string | null {
      if (data.output_text) return data.output_text;
      for (const item of data.output || []) {
        if (item.type === 'message') {
          for (const c of item.content || []) {
            if (c.type === 'output_text' && c.text) return c.text;
          }
        }
      }
      return null;
    }

    let parsed: any;
    try {
      const res = await fetch('https://api.groq.com/openai/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // Fallback to smaller model
        const res2 = await fetch('https://api.groq.com/openai/v1/responses', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, model: 'openai/gpt-oss-20b', reasoning: undefined }),
        });
        if (!res2.ok) throw new Error('LLM unavailable');
        const d2 = await res2.json();
        const text2 = extractText(d2);
        if (!text2) throw new Error('LLM parse error');
        parsed = JSON.parse(text2);
      } else {
        const data = await res.json();
        const text = extractText(data);
        if (!text) throw new Error('LLM parse error');
        parsed = JSON.parse(text);
      }
    } catch (err: any) {
      // Return template config on LLM failure
      return NextResponse.json({
        config: baseConfig,
        summary: `Failed to generate: ${err.message}. Using default config.`,
      });
    }

    const config: AgentConfig = {
      name: parsed.name || baseConfig.name || 'Agent',
      personality: parsed.personality || baseConfig.personality,
      riskTolerance: Math.max(1, Math.min(10, parsed.riskTolerance || baseConfig.riskTolerance)),
      maxPositionSize: Math.max(5, Math.min(100, parsed.maxPositionSize || baseConfig.maxPositionSize)),
      maxDrawdown: Math.max(5, Math.min(50, parsed.maxDrawdown || baseConfig.maxDrawdown)),
      stopLoss: Math.max(1, Math.min(25, parsed.stopLoss || baseConfig.stopLoss)),
      takeProfit: Math.max(2, Math.min(100, parsed.takeProfit || baseConfig.takeProfit)),
      tradingPairs: parsed.tradingPairs?.length ? parsed.tradingPairs : baseConfig.tradingPairs,
      tradingActions: parsed.tradingActions?.length ? parsed.tradingActions : baseConfig.tradingActions,
      rebalanceThreshold: Math.max(1, Math.min(20, parsed.rebalanceThreshold || baseConfig.rebalanceThreshold)),
      maxTradesPerRound: Math.max(1, Math.min(10, parsed.maxTradesPerRound || baseConfig.maxTradesPerRound)),
      signals: parsed.signals || baseConfig.signals,
      executionSpeed: parsed.executionSpeed || baseConfig.executionSpeed,
      contrarian: parsed.contrarian ?? baseConfig.contrarian,
    };

    return NextResponse.json({
      config,
      summary: parsed.summary || `${config.name} — risk ${config.riskTolerance}/10`,
    });
  } catch (err: any) {
    console.error('Chat-create error:', err);
    return NextResponse.json({ error: err.message || 'Failed to generate agent' }, { status: 500 });
  }
}
