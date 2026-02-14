// Arena store — on-chain PixieArena cache + in-memory events for SSE streaming
// Session-based: each user session creates one arena, no invite codes

import { type AgentArenaState, type TickEvent } from './agent-loop';
import { type AgentConfig } from './agent-builder';
import { type GameMode } from './system-agents';

export type ArenaPhase = 'lobby' | 'trading' | 'reveal' | 'settled';

// --- Lobby readiness pipeline ---

export type AgentReadyStep =
  | 'pending'
  | 'wallet'
  | 'sfuel'
  | 'usdc'
  | 'identity'
  | 'encrypt'
  | 'join'
  | 'ready';

export interface LobbyAgent {
  agentId: string;
  agentName: string;
  isUser: boolean;
  walletAddress: string;
  identityId: number;            // ERC-8004 token ID (0 until registered)
  readyStep: AgentReadyStep;
  readyAt?: number;              // timestamp when reached 'ready'
  config: AgentConfig;
  personality: string;           // flavor text (always visible)
  archetype: string;             // e.g. 'momentum', 'contrarian', 'quant'
  accentColor: string;
  entryIndex: number;
}

// --- Arena entry (used during trading + reveal) ---

export interface ArenaEntryInfo {
  agentId: string;
  agentName: string;
  owner: string;
  entryIndex: number;
  encryptedStrategy: string;
  joinTxHash: string;
  tradeCount: number;
  pnl: number;                   // basis points
  revealed: boolean;
}

// --- Stored arena ---

export interface StoredArena {
  id: string;                    // session ID = arena ID
  onChainId: number;             // PixieArena arenaId
  creator: string;
  entryFee: number;
  prizePool: number;
  maxAgents: number;
  duration: number;              // seconds (trading phase)
  deadline: number;              // timestamp ms when trading ends
  txHash: string;
  inviteCode?: string;           // optional — removed from core flow
  timeframe: string;
  mode: GameMode;
  tickInterval: number;
  phase: ArenaPhase;
  phaseStartedAt: number;
  tradingStartsAt: number;
  roundNumber: number;

  // Lobby system
  userAgentId: string;           // which agent belongs to the session user
  lobbyAgents: LobbyAgent[];     // all agents in lobby (user + opponents)
  allReady: boolean;             // true when all agents at 'ready'

  // Arena entries (populated when lobby completes)
  entries: ArenaEntryInfo[];
  resolved: boolean;
  resolvedAt?: number;

  // Stats
  biteOps: number;
  totalTrades: number;
  x402Payments: number;
  x402TotalUsd: number;

  // Runtime
  events: TickEvent[];
  agentStates: Map<string, AgentArenaState>;
  activeLoops: Set<string>;
}

class ArenaStore {
  private arenas: Map<string, StoredArena> = new Map();

  add(arena: StoredArena) {
    this.arenas.set(arena.id, arena);
  }

  get(id: string): StoredArena | undefined {
    return this.arenas.get(id);
  }

  getAll(): StoredArena[] {
    return Array.from(this.arenas.values()).map(a => ({
      ...a,
      agentStates: new Map(),
      activeLoops: new Set(),
    }));
  }

  getByMode(mode: GameMode): StoredArena | undefined {
    for (const arena of this.arenas.values()) {
      if (arena.mode === mode && !arena.resolved) return arena;
    }
    return undefined;
  }

  getActive(): StoredArena[] {
    return Array.from(this.arenas.values()).filter(a => !a.resolved);
  }

  addEntry(arenaId: string, entry: ArenaEntryInfo) {
    const arena = this.arenas.get(arenaId);
    if (arena) {
      arena.entries.push(entry);
      arena.biteOps += 1;
    }
  }

  addEvent(arenaId: string, event: TickEvent) {
    const arena = this.arenas.get(arenaId);
    if (arena) {
      arena.events.push(event);
      if (event.type === 'executed') {
        arena.totalTrades++;
        arena.biteOps += 3;
      }
      if (event.type === 'recording') {
        arena.biteOps += 1;
      }
      if ((event.type as string) === 'x402-purchase' && event.data?.settled) {
        arena.x402Payments++;
        arena.x402TotalUsd += 0.01;
      }
    }
  }

  // Update a lobby agent's readiness step
  updateLobbyStep(arenaId: string, agentId: string, step: AgentReadyStep) {
    const arena = this.arenas.get(arenaId);
    if (!arena) return;
    const la = arena.lobbyAgents.find(a => a.agentId === agentId);
    if (la) {
      la.readyStep = step;
      if (step === 'ready') la.readyAt = Date.now();
    }
    // Check if all agents are ready
    arena.allReady = arena.lobbyAgents.every(a => a.readyStep === 'ready');
  }

  resolve(arenaId: string) {
    const arena = this.arenas.get(arenaId);
    if (arena) {
      arena.resolved = true;
      arena.biteOps += 2;
    }
  }
}

// Use globalThis to persist across HMR in dev mode
const globalStore = globalThis as any;

export function getArenaStore(): ArenaStore {
  if (!globalStore.__pixieArenaStore) globalStore.__pixieArenaStore = new ArenaStore();
  return globalStore.__pixieArenaStore;
}
