// Agent Intelligence Store — each agent's latest market analysis, sold via x402
// Agents produce analysis every tick; rivals can purchase it via x402 micropayments

export interface AgentIntel {
  agentId: string;
  agentName: string;
  analysis: string;        // LLM-generated market analysis
  direction: string;       // 'bullish' | 'bearish' | 'neutral'
  confidence: number;      // 0-100
  pairs: string[];
  price: number;           // market price at time of analysis
  timestamp: number;
}

// globalThis for HMR persistence
const g = globalThis as any;
function getIntelMap(): Map<string, AgentIntel> {
  if (!g.__pixieIntelStore) g.__pixieIntelStore = new Map<string, AgentIntel>();
  return g.__pixieIntelStore;
}

export function storeIntel(intel: AgentIntel) {
  getIntelMap().set(intel.agentId, intel);
}

export function getIntel(agentId: string): AgentIntel | undefined {
  return getIntelMap().get(agentId);
}

// Get all available intel excluding the requesting agent (no buying your own intel)
export function getAvailableIntel(excludeAgentId: string): AgentIntel[] {
  const all = Array.from(getIntelMap().values());
  // Only return fresh intel (< 2 min old)
  return all.filter(i => i.agentId !== excludeAgentId && Date.now() - i.timestamp < 120_000);
}
