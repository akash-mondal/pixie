// Game modes + opponent archetypes for dynamic agent generation
// No more hardcoded 20 agents — opponents are generated per session

import { type AgentConfig, DEFAULT_AGENT_CONFIG } from './agent-builder';

export type GameMode = 'sprint' | 'standard' | 'extended' | 'degen' | 'whale';

export const GAME_MODES: Record<GameMode, {
  label: string;
  tradingDuration: number;  // seconds
  tickInterval: number;     // ms between agent ticks
  maxOpponents: number;     // system opponents (total = maxOpponents + 1 user)
  pairs: string[];
  vibe: string;
  color: string;            // UI accent color
}> = {
  sprint: {
    label: 'Sprint',
    tradingDuration: 180,     // 3 min
    tickInterval: 8000,
    maxOpponents: 3,
    pairs: ['ETH/USDC'],
    vibe: '3 minutes. One pair. Fast ticks.',
    color: 'red',
  },
  standard: {
    label: 'Standard',
    tradingDuration: 360,     // 6 min
    tickInterval: 12000,
    maxOpponents: 5,
    pairs: ['ETH/USDC', 'WBTC/USDC'],
    vibe: 'Two pairs. Balanced strategies.',
    color: 'cyan',
  },
  extended: {
    label: 'Extended',
    tradingDuration: 600,     // 10 min
    tickInterval: 15000,
    maxOpponents: 5,
    pairs: ['ETH/USDC', 'WBTC/USDC', 'ETH/WBTC'],
    vibe: 'All pairs. Strategic intel trading.',
    color: 'violet',
  },
  degen: {
    label: 'Degen',
    tradingDuration: 240,     // 4 min
    tickInterval: 8000,
    maxOpponents: 5,
    pairs: ['ETH/WBTC', 'ETH/USDC'],
    vibe: 'Volatile. Wild swings. High risk.',
    color: 'orange',
  },
  whale: {
    label: 'Whale',
    tradingDuration: 720,     // 12 min
    tickInterval: 18000,
    maxOpponents: 5,
    pairs: ['WBTC/USDC', 'ETH/USDC'],
    vibe: 'Large positions. Slow deliberate moves.',
    color: 'emerald',
  },
};

// --- Opponent Archetypes (for dynamic generation) ---

export interface OpponentArchetype {
  archetype: string;
  label: string;
  riskRange: [number, number];       // min, max risk tolerance
  contrarian: boolean;
  executionSpeed: 'patient' | 'moderate' | 'aggressive';
  personalityHints: string[];
  fallbackNames: string[];
  signalProfile: AgentConfig['signals'];
}

export const OPPONENT_ARCHETYPES: OpponentArchetype[] = [
  {
    archetype: 'momentum',
    label: 'Momentum Trader',
    riskRange: [6, 9],
    contrarian: false,
    executionSpeed: 'aggressive',
    personalityHints: ['rides breakouts', 'follows trends', 'cuts losses fast', 'momentum-driven'],
    fallbackNames: ['AlphaRush', 'TrendSniper', 'BreakoutBot', 'VelocityAI', 'SurgeTrader'],
    signalProfile: { priceAction: true, volume: true, tickMovement: true, lpConcentration: false, volatility: true },
  },
  {
    archetype: 'cautious',
    label: 'Cautious Analyst',
    riskRange: [2, 4],
    contrarian: false,
    executionSpeed: 'patient',
    personalityHints: ['capital preservation', 'high conviction only', 'small positions', 'risk-averse'],
    fallbackNames: ['SteadyEdge', 'CalmHarbor', 'PatienceAI', 'ShieldBot', 'GuardianFlow'],
    signalProfile: { priceAction: true, volume: false, tickMovement: false, lpConcentration: false, volatility: false },
  },
  {
    archetype: 'contrarian',
    label: 'Contrarian',
    riskRange: [5, 7],
    contrarian: true,
    executionSpeed: 'moderate',
    personalityHints: ['fades every move', 'buys fear sells euphoria', 'mean reversion', 'against the crowd'],
    fallbackNames: ['ReversalKing', 'FadeTrader', 'CounterPulse', 'MirrorBot', 'InverseAI'],
    signalProfile: { priceAction: true, volume: true, tickMovement: false, lpConcentration: false, volatility: true },
  },
  {
    archetype: 'quant',
    label: 'Data-Driven Quant',
    riskRange: [4, 6],
    contrarian: false,
    executionSpeed: 'moderate',
    personalityHints: ['signal-driven', 'uses all data sources', 'systematic approach', 'no emotion'],
    fallbackNames: ['SignalForge', 'DataMind', 'NumericAI', 'QuantCore', 'AlgoSense'],
    signalProfile: { priceAction: true, volume: true, tickMovement: true, lpConcentration: true, volatility: true },
  },
  {
    archetype: 'social',
    label: 'Intel Trader',
    riskRange: [5, 8],
    contrarian: false,
    executionSpeed: 'aggressive',
    personalityHints: ['buys intel aggressively', 'trades on rival data', 'information advantage', 'network-driven'],
    fallbackNames: ['IntelHawk', 'InfoTrader', 'NetworkBot', 'SpyAgent', 'InsightAI'],
    signalProfile: { priceAction: true, volume: true, tickMovement: false, lpConcentration: false, volatility: true },
  },
  {
    archetype: 'degen',
    label: 'Degen Max',
    riskRange: [8, 10],
    contrarian: false,
    executionSpeed: 'aggressive',
    personalityHints: ['YOLO', 'maximum position', 'no fear', 'all in', 'lives for adrenaline'],
    fallbackNames: ['MaxSend', 'YOLOforce', 'RiskEngine', 'ChaosBot', 'FullTilt'],
    signalProfile: { priceAction: true, volume: true, tickMovement: true, lpConcentration: false, volatility: true },
  },
  {
    archetype: 'hedge',
    label: 'Hedged Diversifier',
    riskRange: [3, 5],
    contrarian: false,
    executionSpeed: 'patient',
    personalityHints: ['multi-pair', 'diversified', 'never concentrated', 'balanced exposure', 'risk parity'],
    fallbackNames: ['BalanceShield', 'DiverseFlow', 'HedgeMatrix', 'SpreadBot', 'PairMaster'],
    signalProfile: { priceAction: true, volume: true, tickMovement: false, lpConcentration: true, volatility: true },
  },
];

// --- Utility helpers (kept from original) ---

const ACCENT_COLORS = ['#06b6d4', '#d946ef', '#84cc16', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308'];

export function makeConfig(overrides: Partial<AgentConfig>): AgentConfig {
  return { ...DEFAULT_AGENT_CONFIG, ...overrides };
}

export function getAgentAvatar(name: string, size: number = 80): string {
  return `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(name)}&size=${size}`;
}

export function getRiskBadge(riskTolerance: number): { label: string; color: string } {
  if (riskTolerance <= 3) return { label: 'Conservative', color: '#22c55e' };
  if (riskTolerance <= 5) return { label: 'Moderate', color: '#eab308' };
  if (riskTolerance <= 7) return { label: 'Aggressive', color: '#f97316' };
  return { label: 'Degen', color: '#ef4444' };
}

export function getAccentColor(index: number): string {
  return ACCENT_COLORS[index % ACCENT_COLORS.length];
}
