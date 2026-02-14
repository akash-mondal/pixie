export const AGENT_TYPES = [
  {
    id: 'alpha',
    name: 'Alpha',
    title: 'The Strategist',
    risk: 'HIGH',
    aiQuality: 'HIGH',
    description: 'Deep analysis, tight ranges, maximum concentration. High risk, high reward.',
    color: '#22c55e',
  },
  {
    id: 'beta',
    name: 'Beta',
    title: 'The Conservative',
    risk: 'LOW',
    aiQuality: 'LOW',
    description: 'Wide ranges, long locks. Plays it safe with steady returns.',
    color: '#6b6b6b',
  },
  {
    id: 'gamma',
    name: 'Gamma',
    title: 'The Lazy Whale',
    risk: 'NONE',
    aiQuality: 'NONE',
    description: 'Full-range position, maximum laziness. No analysis, just vibes.',
    color: '#444',
  },
  {
    id: 'delta',
    name: 'Delta',
    title: 'The Gambler',
    risk: 'HIGH',
    aiQuality: 'NONE',
    description: 'Random tight range. Pure chaos energy. Sometimes hits big.',
    color: '#eab308',
  },
  {
    id: 'epsilon',
    name: 'Epsilon',
    title: 'The Balanced',
    risk: 'MEDIUM',
    aiQuality: 'MEDIUM',
    description: 'Moderate analysis, balanced ranges. The goldilocks approach.',
    color: '#ededed',
  },
] as const;

export type AgentType = (typeof AGENT_TYPES)[number]['id'];

export const POOL_STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'open', color: 'text-green-500' },
  READY: { label: 'sealed', color: 'text-yellow-500' },
  REVEALED: { label: 'revealed', color: 'text-[#ededed]' },
};
