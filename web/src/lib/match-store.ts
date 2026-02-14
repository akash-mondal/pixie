// Match store — invite code system on top of arena-store
// Maps invite codes to arena IDs for shareable match links

import { getArenaStore, type StoredArena, type ArenaEntryInfo } from './arena-store';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 for readability

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

// Code → arenaId mapping (globalThis for HMR persistence)
const g = globalThis as any;
function getCodeMap(): Map<string, string> {
  if (!g.__pixieCodeMap) g.__pixieCodeMap = new Map<string, string>();
  return g.__pixieCodeMap;
}

export function registerCode(code: string, arenaId: string) {
  getCodeMap().set(code.toUpperCase(), arenaId);
}

export function getArenaIdByCode(code: string): string | undefined {
  return getCodeMap().get(code.toUpperCase());
}

export function getMatchByCode(code: string): StoredArena | undefined {
  const arenaId = getArenaIdByCode(code);
  if (!arenaId) return undefined;
  return getArenaStore().get(arenaId);
}

export function getAllMatches(): StoredArena[] {
  const arenas = getArenaStore().getAll();
  return arenas.map(a => ({
    ...a,
    inviteCode: a.inviteCode || [...getCodeMap().entries()].find(([, id]) => id === a.id)?.[0] || '',
  }));
}

// Timeframe presets (legacy compat + 5 game modes)
export const TIMEFRAMES = {
  blitz: { duration: 60, tickInterval: 8000, maxTradesPerRound: 2, label: 'Blitz', sublabel: '1 min', lobbyDuration: 30, breakDuration: 20 },
  standard: { duration: 180, tickInterval: 12000, maxTradesPerRound: 3, label: 'Standard', sublabel: '3 min', lobbyDuration: 45, breakDuration: 30 },
  marathon: { duration: 300, tickInterval: 15000, maxTradesPerRound: 5, label: 'Marathon', sublabel: '5 min', lobbyDuration: 60, breakDuration: 45 },
  degen: { duration: 120, tickInterval: 10000, maxTradesPerRound: 5, label: 'Degen Hour', sublabel: '2 min', lobbyDuration: 30, breakDuration: 25 },
  whale: { duration: 240, tickInterval: 14000, maxTradesPerRound: 3, label: 'Whale Wars', sublabel: '4 min', lobbyDuration: 45, breakDuration: 40 },
} as const;

export type TimeframeKey = keyof typeof TIMEFRAMES;
