// Opponent Generator — dynamically create diverse agent opponents per session
// Uses Groq LLM for unique names/personalities, falls back to hardcoded names

import { type AgentConfig } from './agent-builder';
import { type GameMode, GAME_MODES, OPPONENT_ARCHETYPES, type OpponentArchetype, makeConfig, getAccentColor } from './system-agents';

export interface GeneratedOpponent {
  config: AgentConfig;
  archetype: string;
  accentColor: string;
}

// Pick N diverse archetypes (no duplicates)
function selectDiverseArchetypes(count: number): OpponentArchetype[] {
  const shuffled = [...OPPONENT_ARCHETYPES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Random int in range [min, max]
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Derive config values from archetype + risk
function deriveConfig(arch: OpponentArchetype, risk: number, pairs: string[]): Partial<AgentConfig> {
  return {
    riskTolerance: risk,
    maxPositionSize: Math.min(80, 10 + risk * 7),
    maxDrawdown: Math.min(40, 5 + risk * 4),
    stopLoss: Math.min(20, 2 + risk * 2),
    takeProfit: Math.min(50, 5 + risk * 5),
    tradingPairs: pairs,
    tradingActions: ['swap'],
    rebalanceThreshold: Math.max(2, 12 - risk),
    maxTradesPerRound: 20,
    signals: arch.signalProfile,
    executionSpeed: arch.executionSpeed,
    contrarian: arch.contrarian,
  };
}

// Generate names + personalities via Groq LLM (batch call)
async function generateNamesViaLLM(
  archetypes: OpponentArchetype[],
): Promise<Array<{ name: string; personality: string }> | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const prompt = `Generate ${archetypes.length} unique AI trading agent names and personalities. Each must be distinctly different.

${archetypes.map((a, i) => `Agent ${i + 1}: ${a.label} archetype. Traits: ${a.personalityHints.join(', ')}`).join('\n')}

Return ONLY a JSON array with objects like: [{"name": "AgentName", "personality": "2-sentence personality description"}]
No markdown, no explanation, just the JSON array.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b', // fast model for name generation
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Try to parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length < archetypes.length) return null;

    return parsed.slice(0, archetypes.length).map((p: any) => ({
      name: String(p.name || 'Agent').replace(/[^a-zA-Z0-9]/g, ''),
      personality: String(p.personality || '').slice(0, 200),
    }));
  } catch (err) {
    console.warn('[opponent-gen] LLM name generation failed, using fallbacks');
    return null;
  }
}

// Fallback: pick random name from archetype's fallback list
function fallbackNameAndPersonality(arch: OpponentArchetype, usedNames: Set<string>): { name: string; personality: string } {
  const available = arch.fallbackNames.filter(n => !usedNames.has(n));
  const name = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : `${arch.label.replace(/\s+/g, '')}${randInt(100, 999)}`;

  const hints = arch.personalityHints;
  const personality = `${arch.label} who ${hints[0]} and ${hints[1]}. ${hints[2] ? `Known for: ${hints[2]}.` : ''}`;

  return { name, personality };
}

// Main function: generate N diverse opponents for a game mode
export async function generateOpponents(
  mode: GameMode,
  count: number,
): Promise<GeneratedOpponent[]> {
  const modeConfig = GAME_MODES[mode];
  const archetypes = selectDiverseArchetypes(count);

  // Try LLM for names
  const llmNames = await generateNamesViaLLM(archetypes);

  const usedNames = new Set<string>();
  const opponents: GeneratedOpponent[] = [];

  for (let i = 0; i < archetypes.length; i++) {
    const arch = archetypes[i];
    const risk = randInt(arch.riskRange[0], arch.riskRange[1]);

    let name: string;
    let personality: string;

    if (llmNames && llmNames[i]) {
      name = llmNames[i].name;
      personality = llmNames[i].personality;
    } else {
      const fallback = fallbackNameAndPersonality(arch, usedNames);
      name = fallback.name;
      personality = fallback.personality;
    }

    usedNames.add(name);

    const config = makeConfig({
      name,
      personality,
      ...deriveConfig(arch, risk, modeConfig.pairs),
    });

    opponents.push({
      config,
      archetype: arch.archetype,
      accentColor: getAccentColor(i),
    });
  }

  console.log(`[opponent-gen] Generated ${opponents.length} opponents for ${mode}: ${opponents.map(o => `${o.config.name} (${o.archetype})`).join(', ')}`);

  return opponents;
}
