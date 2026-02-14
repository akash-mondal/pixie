// Agent store — on-chain IdentityRegistry cache + in-memory config storage
// Agents are registered on-chain via server wallet, configs cached here for fast reads

import { type AgentConfig } from './agent-builder';

export interface StoredAgent {
  id: string;           // on-chain agentId as string
  onChainId: number;    // IdentityRegistry token ID
  name: string;
  personality: string;
  config: AgentConfig;
  encryptedConfig: string;
  encryptedPersonality: string;
  owner: string;
  walletAddress: string; // agent's own wallet (for on-chain ops)
  funded: boolean;       // sFUEL + USDC funded
  registeredAt: number;
  txHash: string;       // on-chain registration tx hash
  arenaCount: number;
  totalTrades: number;
}

class AgentStore {
  private agents: Map<string, StoredAgent> = new Map();

  add(agent: StoredAgent) {
    this.agents.set(agent.id, agent);
  }

  get(id: string): StoredAgent | undefined {
    return this.agents.get(id);
  }

  getAll(): StoredAgent[] {
    return Array.from(this.agents.values());
  }

  getByOwner(owner: string): StoredAgent[] {
    return this.getAll().filter(a => a.owner.toLowerCase() === owner.toLowerCase());
  }

  incrementTrades(id: string, count: number = 1) {
    const agent = this.agents.get(id);
    if (agent) agent.totalTrades += count;
  }

  incrementArenas(id: string) {
    const agent = this.agents.get(id);
    if (agent) agent.arenaCount++;
  }
}

// Use globalThis to persist across HMR in dev mode
const globalStore = globalThis as any;

export function getAgentStore(): AgentStore {
  if (!globalStore.__pixieAgentStore) globalStore.__pixieAgentStore = new AgentStore();
  return globalStore.__pixieAgentStore;
}
