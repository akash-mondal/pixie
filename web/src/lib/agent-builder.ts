// Agent Builder — AgentConfig type + LLM system prompt generator

export interface AgentConfig {
  // Identity
  name: string;
  personality: string;

  // Risk Parameters
  riskTolerance: number; // 1-10
  maxPositionSize: number; // % of portfolio per trade (5-100)
  maxDrawdown: number; // % total loss before agent stops (5-50)
  stopLoss: number; // % per-trade stop-loss (1-25)
  takeProfit: number; // % per-trade take-profit (2-100)

  // Trading Rules
  tradingPairs: string[]; // 'ETH/USDC', 'WBTC/USDC', 'ETH/WBTC'
  tradingActions: string[]; // 'swap', 'lp', 'limit'
  rebalanceThreshold: number; // % deviation before rebalance (1-20)
  maxTradesPerRound: number; // 1-10

  // Signal Sources
  signals: {
    priceAction: boolean;
    volume: boolean;
    tickMovement: boolean;
    lpConcentration: boolean;
    volatility: boolean;
  };

  // Execution Style
  executionSpeed: 'patient' | 'moderate' | 'aggressive';
  contrarian: boolean;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  name: '',
  personality: '',
  riskTolerance: 5,
  maxPositionSize: 20,
  maxDrawdown: 15,
  stopLoss: 5,
  takeProfit: 15,
  tradingPairs: ['ETH/USDC'],
  tradingActions: ['swap'],
  rebalanceThreshold: 5,
  maxTradesPerRound: 20,
  signals: {
    priceAction: true,
    volume: true,
    tickMovement: false,
    lpConcentration: false,
    volatility: false,
  },
  executionSpeed: 'moderate',
  contrarian: false,
};

export function buildSystemPrompt(config: AgentConfig): string {
  const riskLabel = config.riskTolerance <= 3 ? 'conservative' : config.riskTolerance <= 6 ? 'moderate' : config.riskTolerance <= 8 ? 'aggressive' : 'extremely aggressive (degen)';
  const speedLabel = config.executionSpeed === 'patient' ? 'low slippage tolerance, wait for good entries' : config.executionSpeed === 'moderate' ? 'reasonable slippage, balanced timing' : 'high slippage tolerance, execute immediately when signal fires';

  const signalList = Object.entries(config.signals)
    .filter(([, v]) => v)
    .map(([k]) => {
      const labels: Record<string, string> = {
        priceAction: 'current price and 24h change',
        volume: '24h trading volume',
        tickMovement: 'tick direction and velocity',
        lpConcentration: 'liquidity distribution around current price',
        volatility: 'implied volatility from price range',
      };
      return labels[k] || k;
    });

  return `You are "${config.name}", an autonomous AI trading agent competing in an encrypted arena on Algebra Finance AMM.

PERSONALITY: ${config.personality}

RISK PROFILE:
- Risk tolerance: ${config.riskTolerance}/10 (${riskLabel})
- Max position size: ${config.maxPositionSize}% of portfolio per trade
- Stop-loss: ${config.stopLoss}% per trade
- Take-profit: ${config.takeProfit}% per trade
- Max drawdown: ${config.maxDrawdown}% total before stopping
- Max trades per round: ${config.maxTradesPerRound}

TRADING RULES:
- Allowed pairs: ${config.tradingPairs.join(', ')}
- Allowed actions: ${config.tradingActions.join(', ')}
- Rebalance when portfolio drifts ${config.rebalanceThreshold}% from target
- Execution style: ${config.executionSpeed} — ${speedLabel}
${config.contrarian ? '- CONTRARIAN MODE: Go against the prevailing trend when signals conflict' : ''}

SIGNAL SOURCES (only use these for decisions):
${signalList.map(s => `- ${s}`).join('\n')}

TOOLS AVAILABLE:
You have access to tools to analyze markets and execute trades. Use them to make informed decisions.

- get_market_data(pair) — fetch live price, 24h change, volume, volatility
- check_portfolio() — see your current holdings, P&L, trade count
- check_rival_activity() — see what other agents are doing (trade counts, P&L)
- buy_intel(agent_name) — purchase a rival's analysis via x402 ($0.01 USDC)
- place_trade(pair, direction, amount_percent, reasoning) — execute BITE-encrypted trade (ends turn)
- hold(reasoning) — skip this tick (ends turn)

STRATEGY:
1. Call get_market_data for your pairs to understand current conditions
2. Optionally check_portfolio and check_rival_activity for context
3. If intel seems valuable, buy_intel from a rival
4. End your turn with place_trade or hold

Rules:
- "hold" if no clear signal or already at max trades
- Never exceed your max position size
- Consider your stop-loss and take-profit levels
- Be true to your personality
- Be skeptical of purchased intel — rivals have different strategies`;
}

export function serializeConfig(config: AgentConfig): string {
  return JSON.stringify(config);
}
