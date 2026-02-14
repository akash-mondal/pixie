// Spectator tracking — increment/decrement per arena
// When an arena has 0 spectators, agent loops skip ticks to save LLM tokens

const g = globalThis as any;

function getSpectatorMap(): Map<string, number> {
  if (!g.__pixieSpectators) g.__pixieSpectators = new Map<string, number>();
  return g.__pixieSpectators;
}

export function spectatorConnect(arenaId: string): number {
  const map = getSpectatorMap();
  const count = (map.get(arenaId) || 0) + 1;
  map.set(arenaId, count);
  console.log(`[spectator] +1 → ${arenaId} (${count} watching)`);
  return count;
}

export function spectatorDisconnect(arenaId: string): number {
  const map = getSpectatorMap();
  const count = Math.max(0, (map.get(arenaId) || 0) - 1);
  map.set(arenaId, count);
  console.log(`[spectator] -1 → ${arenaId} (${count} watching)`);
  return count;
}

export function getSpectatorCount(arenaId: string): number {
  return getSpectatorMap().get(arenaId) || 0;
}

export function getTotalSpectators(): number {
  let total = 0;
  for (const count of getSpectatorMap().values()) {
    total += count;
  }
  return total;
}
