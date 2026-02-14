// PixieArena contract — ABI + viem helpers

import { parseAbi, type Address, formatUnits } from 'viem';
import { publicClient } from './contract';

export const ARENA_ADDRESS = (process.env.NEXT_PUBLIC_ARENA_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;

export const PIXIE_ARENA_ABI = parseAbi([
  'function createArena(uint256 entryFee, uint256 maxAgents, uint256 duration, uint256 prizeAmount) external returns (uint256)',
  'function joinArena(uint256 arenaId, uint256 agentId, bytes encryptedStrategy) external returns (uint256)',
  'function recordTrade(uint256 arenaId, uint256 entryIndex, bytes encryptedTxHash, bytes encryptedPnL) external',
  'function finalizeArena(uint256 arenaId) external payable',
  'function claimPrize(uint256 arenaId, uint256 entryIndex) external',
  'function getArena(uint256 arenaId) external view returns (address creator, uint256 entryFee, uint256 prizePool, uint256 maxAgents, uint256 deadline, uint256 entryCount, bool resolved)',
  'function getEntry(uint256 arenaId, uint256 index) external view returns (address owner, uint256 agentId, uint256 tradeCount, int256 revealedPnL, bool revealed, bool claimed)',
  'function arenaCount() external view returns (uint256)',
  'event ArenaCreated(uint256 indexed arenaId, address creator, uint256 entryFee, uint256 maxAgents, uint256 deadline, uint256 prizePool)',
  'event AgentJoined(uint256 indexed arenaId, address owner, uint256 agentId, uint256 entryIndex)',
  'event TradeRecorded(uint256 indexed arenaId, uint256 entryIndex, uint256 tradeIndex)',
  'event ArenaFinalized(uint256 indexed arenaId, uint256 entryCount)',
  'event StrategiesRevealed(uint256 indexed arenaId, uint256 count)',
]);

// --- Types ---

export interface ArenaInfo {
  arenaId: number;
  creator: string;
  entryFee: number;
  prizePool: number;
  maxAgents: number;
  deadline: number;
  entryCount: number;
  resolved: boolean;
}

export interface ArenaEntry {
  index: number;
  owner: string;
  agentId: number;
  tradeCount: number;
  revealedPnL: number;
  revealed: boolean;
  claimed: boolean;
}

// --- Read helpers ---

export async function getArenaCount(): Promise<number> {
  const count = await publicClient.readContract({
    address: ARENA_ADDRESS,
    abi: PIXIE_ARENA_ABI,
    functionName: 'arenaCount',
  });
  return Number(count);
}

export async function getArena(arenaId: number): Promise<ArenaInfo> {
  const result = await publicClient.readContract({
    address: ARENA_ADDRESS,
    abi: PIXIE_ARENA_ABI,
    functionName: 'getArena',
    args: [BigInt(arenaId)],
  });
  return {
    arenaId,
    creator: result[0],
    entryFee: Number(formatUnits(result[1], 6)),
    prizePool: Number(formatUnits(result[2], 6)),
    maxAgents: Number(result[3]),
    deadline: Number(result[4]),
    entryCount: Number(result[5]),
    resolved: result[6],
  };
}

export async function getArenaEntry(arenaId: number, index: number): Promise<ArenaEntry> {
  const result = await publicClient.readContract({
    address: ARENA_ADDRESS,
    abi: PIXIE_ARENA_ABI,
    functionName: 'getEntry',
    args: [BigInt(arenaId), BigInt(index)],
  });
  return {
    index,
    owner: result[0],
    agentId: Number(result[1]),
    tradeCount: Number(result[2]),
    revealedPnL: Number(result[3]),
    revealed: result[4],
    claimed: result[5],
  };
}

export async function listArenas(): Promise<ArenaInfo[]> {
  const count = await getArenaCount();
  const arenas: ArenaInfo[] = [];
  for (let i = 0; i < count; i++) {
    try {
      arenas.push(await getArena(i));
    } catch { /* skip */ }
  }
  return arenas;
}

export async function getArenaWithEntries(arenaId: number) {
  const arena = await getArena(arenaId);
  const entries: ArenaEntry[] = [];
  for (let i = 0; i < arena.entryCount; i++) {
    entries.push(await getArenaEntry(arenaId, i));
  }
  return { arena, entries };
}
