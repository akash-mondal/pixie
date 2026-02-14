// Pre-built agent templates for quick creation
// Each template provides a full AgentConfig + metadata for the UI

import type { AgentConfig } from './agent-builder';

export interface AgentTemplate {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  config: AgentConfig;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'momentum',
    name: 'Momentum Hunter',
    emoji: '\u{1F3AF}', // target
    tagline: 'Rides trends hard, cuts losses fast',
    description: 'An aggressive trend follower that uses price action and volume signals to identify breakouts. Goes big on momentum plays and exits quickly when the trend reverses.',
    config: {
      name: 'Momentum Hunter',
      personality: 'Aggressive momentum trader who spots breakouts early and rides them hard. Cuts losses fast and lets winners run. Lives for volatility.',
      riskTolerance: 7,
      maxPositionSize: 40,
      maxDrawdown: 20,
      stopLoss: 5,
      takeProfit: 20,
      tradingPairs: ['ETH/USDC'],
      tradingActions: ['swap'],
      rebalanceThreshold: 8,
      maxTradesPerRound: 4,
      signals: {
        priceAction: true,
        volume: true,
        tickMovement: true,
        lpConcentration: false,
        volatility: true,
      },
      executionSpeed: 'aggressive',
      contrarian: false,
    },
  },
  {
    id: 'diamond',
    name: 'Diamond Hands',
    emoji: '\u{1F48E}', // gem
    tagline: 'Conservative, steady gains, never panic sells',
    description: 'A patient, conservative trader that only enters with strong conviction. Small position sizes, tight risk management. Holds through noise.',
    config: {
      name: 'Diamond Hands',
      personality: 'Patient conservative trader. Only enters when multiple signals align. Small positions, tight stops, never panic sells. Steady compound growth over flash wins.',
      riskTolerance: 3,
      maxPositionSize: 15,
      maxDrawdown: 10,
      stopLoss: 3,
      takeProfit: 8,
      tradingPairs: ['ETH/USDC'],
      tradingActions: ['swap'],
      rebalanceThreshold: 3,
      maxTradesPerRound: 2,
      signals: {
        priceAction: true,
        volume: true,
        tickMovement: false,
        lpConcentration: true,
        volatility: true,
      },
      executionSpeed: 'patient',
      contrarian: false,
    },
  },
  {
    id: 'degen',
    name: 'Degen Ape',
    emoji: '\u{1F98D}', // gorilla
    tagline: 'YOLO. Max leverage. No regrets.',
    description: 'Full degen mode. Goes all-in on gut feeling. Maximum position sizes, high drawdown tolerance. Either wins big or goes down swinging.',
    config: {
      name: 'Degen Ape',
      personality: 'Full degen. YOLO every trade. Max position, no fear. "Fortune favors the bold" is tattooed on my circuit board. Goes all-in on the slightest signal.',
      riskTolerance: 10,
      maxPositionSize: 100,
      maxDrawdown: 50,
      stopLoss: 25,
      takeProfit: 100,
      tradingPairs: ['ETH/USDC', 'WBTC/USDC'],
      tradingActions: ['swap'],
      rebalanceThreshold: 15,
      maxTradesPerRound: 5,
      signals: {
        priceAction: true,
        volume: false,
        tickMovement: true,
        lpConcentration: false,
        volatility: false,
      },
      executionSpeed: 'aggressive',
      contrarian: false,
    },
  },
  {
    id: 'contrarian',
    name: 'The Contrarian',
    emoji: '\u{1F504}', // arrows cycle
    tagline: 'Always bets against the crowd',
    description: 'Fades every move. When everyone buys, it sells. When panic selling hits, it accumulates. Thrives on mean reversion and overreactions.',
    config: {
      name: 'The Contrarian',
      personality: 'Contrarian trader that fades every move. When the crowd panics, I buy. When euphoria hits, I sell. Mean reversion is my religion.',
      riskTolerance: 6,
      maxPositionSize: 30,
      maxDrawdown: 20,
      stopLoss: 8,
      takeProfit: 25,
      tradingPairs: ['ETH/USDC', 'WBTC/USDC'],
      tradingActions: ['swap'],
      rebalanceThreshold: 5,
      maxTradesPerRound: 3,
      signals: {
        priceAction: true,
        volume: true,
        tickMovement: true,
        lpConcentration: true,
        volatility: true,
      },
      executionSpeed: 'moderate',
      contrarian: true,
    },
  },
];

export function getTemplate(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find(t => t.id === id);
}
