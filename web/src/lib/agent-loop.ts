// Autonomous Agent Loop — server-side agent tick logic with REAL on-chain operations
// Each tick: LLM agent uses tools (market data, portfolio, intel) → decides → BITE encrypt → record on-chain
// Uses Groq Chat Completions API with tool calling for genuine agentic behavior

import { type Address } from 'viem';
import { type AgentConfig, buildSystemPrompt } from './agent-builder';
import { getMarketStateLive, type MarketState, TOKENS } from './algebra';
import { encryptSwapTransaction, encryptPnL, encryptReasoning } from './trade-engine';
import { writeServerContract, waitForTx, toBytes } from './server-wallet';
import { writeAgentContract, waitForAgentTx } from './agent-wallet';
import { PIXIE_ARENA_ABI, ARENA_ADDRESS } from './arena';
import { getArenaStore } from './arena-store';
import { storeIntel, getAvailableIntel } from './agent-intel';
import { purchaseRivalIntel, initAgentBudget } from './x402-agent';
import { formatMemoryForPrompt, recordIntelPurchase, recordIntelSale } from './agent-memory';
import { executeRealSwap, calculateRealPnL, resolveSwapTokens } from './dex-swap';

// Agent accent colors for UI
export const AGENT_COLORS = ['#06b6d4', '#d946ef', '#84cc16', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308'] as const;

// Personality quips — injected occasionally into events
const QUIPS: Record<string, string[]> = {
  aggressive: ['"Let\'s ride this wave."', '"Volatility is my playground."', '"Send it."', '"The trend is my friend."'],
  conservative: ['"Patience pays."', '"Not yet... waiting for confirmation."', '"Small gains compound."', '"Risk management is survival."'],
  degen: ['"YOLO MODE ACTIVATED."', '"Fortune favors the bold."', '"All in, no regrets."', '"To the moon or to zero."'],
  contrarian: ['"Everyone\'s buying? I\'m selling."', '"Fear is opportunity."', '"The crowd is always wrong."', '"Mean reversion incoming."'],
};

// --- Types ---

export interface AgentArenaState {
  agentId: string;
  agentName: string;
  config: AgentConfig;
  systemPrompt: string;
  walletAddress: Address;
  arenaOnChainId: number;   // for PixieArena.recordTrade
  entryIndex: number;        // for PixieArena.recordTrade
  accentColor: string;       // UI color for this agent
  portfolio: Record<string, number>; // token → amount
  trades: TradeResult[];
  pnl: number; // running P&L in basis points
  totalTradesThisRound: number;
  stopped: boolean;
  stopReason?: string;
  startingValue: number;
  tickNumber: number;
  arenaId: string;
}

export interface TradeResult {
  pair: string;
  direction: 'buy' | 'sell';
  amountIn: number;
  encrypted: string;
  encryptedPnL: string;
  encryptedReasoning: string;
  reasoning: string;
  timestamp: number;
  simulatedPnL: number;
  recordTxHash?: string; // on-chain PixieArena.recordTrade tx
  swapTxHash?: string;   // real Algebra DEX swap tx
  realSwap?: boolean;     // true if real swap executed
}

export interface TickEvent {
  type: 'analyzing' | 'decision' | 'encrypting' | 'executed' | 'hold' | 'stop' | 'error' | 'recording' | 'x402-purchase';
  agentId: string;
  agentName: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface TradeDecision {
  action: 'swap' | 'hold' | 'stop';
  pair: string;
  direction: 'buy' | 'sell';
  amountPercent: number;
  reasoning: string;
}

// --- Agent Tool Definitions (Groq Chat Completions format) ---

const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_market_data',
      description: 'Fetch live market data for a trading pair including price, 24h change, volume, and volatility from CoinGecko',
      parameters: {
        type: 'object',
        properties: {
          pair: { type: 'string', description: 'Trading pair like ETH/USDC, WBTC/USDC, or ETH/WBTC' },
        },
        required: ['pair'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_portfolio',
      description: 'Check your current portfolio holdings, P&L, and trade count',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_rival_activity',
      description: 'See what other agents in the arena are doing — their trade counts and P&L (strategies are encrypted)',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'buy_intel',
      description: 'Purchase a rival agent\'s market analysis via x402 micropayment ($0.01 USDC). Returns their analysis, direction bias, and confidence level.',
      parameters: {
        type: 'object',
        properties: {
          agent_name: { type: 'string', description: 'Name of the rival agent to buy intel from' },
        },
        required: ['agent_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'place_trade',
      description: 'Execute a BITE-encrypted trade. This ends your turn. The trade will be encrypted with threshold encryption and recorded on-chain.',
      parameters: {
        type: 'object',
        properties: {
          pair: { type: 'string', description: 'Trading pair: ETH/USDC, WBTC/USDC, or ETH/WBTC' },
          direction: { type: 'string', enum: ['buy', 'sell'], description: 'Buy or sell' },
          amount_percent: { type: 'number', description: 'Percent of portfolio to trade (1-100)' },
          reasoning: { type: 'string', description: 'Brief explanation of your trade decision' },
        },
        required: ['pair', 'direction', 'amount_percent', 'reasoning'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'hold',
      description: 'Skip this tick without trading. Use when no clear signal or already at max trades. This ends your turn.',
      parameters: {
        type: 'object',
        properties: {
          reasoning: { type: 'string', description: 'Brief explanation of why you are holding' },
        },
        required: ['reasoning'],
      },
    },
  },
];

// --- Tool Execution ---

interface ToolContext {
  state: AgentArenaState;
  emit: (event: TickEvent) => void;
  markets: Map<string, MarketState>;
}

async function executeToolCall(
  toolName: string,
  args: Record<string, any>,
  ctx: ToolContext,
): Promise<{ result: string; terminal?: TradeDecision }> {
  const { state, emit, markets } = ctx;

  switch (toolName) {
    case 'get_market_data': {
      const pair = args.pair || state.config.tradingPairs[0];
      let market = markets.get(pair);

      if (!market) {
        market = await getMarketStateLive(pair);
        markets.set(pair, market);
      }

      emit({
        type: 'analyzing',
        agentId: state.agentId,
        agentName: state.agentName,
        message: `analyzing ${pair}... ($${market.price.toFixed(2)})`,
        data: { pair, price: market.price, change: market.priceChange24h, accentColor: state.accentColor },
        timestamp: Date.now(),
      });

      // Store intel for sale to other agents
      const quipCategory = state.config.riskTolerance >= 8 ? 'degen' : state.config.contrarian ? 'contrarian' : state.config.riskTolerance <= 4 ? 'conservative' : 'aggressive';
      const direction = market.priceChange24h > 0.5 ? 'bullish' : market.priceChange24h < -0.5 ? 'bearish' : 'neutral';
      storeIntel({
        agentId: state.agentId,
        agentName: state.agentName,
        analysis: `${state.config.personality}. Market ${direction} with ${Math.abs(market.priceChange24h).toFixed(1)}% 24h move. ${market.volatility > 30 ? 'High volatility. ' : ''}${quipCategory === 'degen' ? 'Going aggressive.' : quipCategory === 'conservative' ? 'Staying cautious.' : 'Watching closely.'}`,
        direction,
        confidence: Math.min(95, Math.max(20, 50 + state.config.riskTolerance * 4 + (direction !== 'neutral' ? 15 : 0))),
        pairs: state.config.tradingPairs,
        price: market.price,
        timestamp: Date.now(),
      });

      return {
        result: JSON.stringify({
          pair: market.pair,
          price: market.price,
          priceChange24h: market.priceChange24h,
          volume24h: market.volume24h,
          volatility: market.volatility,
          tvl: market.tvl,
          tickMovement: market.tickMovement,
        }),
      };
    }

    case 'check_portfolio': {
      return {
        result: JSON.stringify({
          holdings: state.portfolio,
          pnl: state.pnl,
          pnlPercent: (state.pnl / 100).toFixed(2),
          tradesThisRound: state.totalTradesThisRound,
          maxTradesPerRound: state.config.maxTradesPerRound,
          startingValue: state.startingValue,
        }),
      };
    }

    case 'check_rival_activity': {
      const arena = getArenaStore().get(state.arenaId);
      if (!arena) return { result: '{"error": "arena not found"}' };

      const rivals = arena.entries
        .filter(e => e.agentId !== state.agentId)
        .map(e => ({
          name: e.agentName,
          tradeCount: e.tradeCount,
          pnl: e.pnl,
          pnlPercent: (e.pnl / 100).toFixed(2),
        }));

      return { result: JSON.stringify({ rivals }) };
    }

    case 'buy_intel': {
      const agentName = args.agent_name;
      const availableIntel = getAvailableIntel(state.agentId);
      const target = availableIntel.find(
        i => i.agentName.toLowerCase() === agentName?.toLowerCase()
      ) || availableIntel[0]; // fallback to first available

      if (!target) {
        return { result: '{"error": "no intel available for purchase"}' };
      }

      const intel = await purchaseRivalIntel(
        state.agentId,
        target.agentId,
        state.arenaId,
        emit,
        state.agentName,
      );

      if (intel) {
        recordIntelPurchase(state.agentId, target.agentId, intel.agentName, 0.01);
        recordIntelSale(target.agentId, state.agentId, state.agentName, 0.01);

        return {
          result: JSON.stringify({
            from: intel.agentName,
            analysis: intel.analysis,
            direction: intel.direction,
            confidence: intel.confidence,
            costUsd: 0.01,
          }),
        };
      }

      return { result: '{"error": "purchase failed — no budget or intel unavailable"}' };
    }

    case 'place_trade': {
      const pair = args.pair || 'ETH/USDC';
      const direction = args.direction || 'buy';
      const amountPercent = Math.min(100, Math.max(1, args.amount_percent || 10));
      const reasoning = args.reasoning || 'tool-called trade';

      return {
        result: JSON.stringify({ status: 'executing', pair, direction, amountPercent, reasoning }),
        terminal: { action: 'swap', pair, direction, amountPercent, reasoning },
      };
    }

    case 'hold': {
      const reasoning = args.reasoning || 'no clear signal';
      return {
        result: JSON.stringify({ status: 'holding', reasoning }),
        terminal: { action: 'hold', pair: 'ETH/USDC', direction: 'buy', amountPercent: 0, reasoning },
      };
    }

    default:
      return { result: `{"error": "unknown tool: ${toolName}"}` };
  }
}

// --- Groq Chat Completions API with tool calling ---

async function callGroqAgent(
  systemPrompt: string,
  kickoff: string,
  ctx: ToolContext,
): Promise<TradeDecision> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const messages: Array<Record<string, any>> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: kickoff },
  ];

  const MAX_ITERATIONS = 5;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    try {
      const body = {
        model: 'openai/gpt-oss-120b',
        messages,
        tools: AGENT_TOOLS,
      };

      let res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Fallback to smaller model
      if (!res.ok) {
        console.warn(`[agent-loop] gpt-oss-120b failed (${res.status}), trying gpt-oss-20b`);
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, model: 'openai/gpt-oss-20b' }),
        });
      }

      if (!res.ok) {
        console.error(`[agent-loop] Both models failed (${res.status})`);
        return { action: 'hold', pair: 'ETH/USDC', direction: 'buy', amountPercent: 0, reasoning: 'LLM unavailable — holding' };
      }

      const data = await res.json();
      const message = data.choices?.[0]?.message;

      if (!message) {
        return { action: 'hold', pair: 'ETH/USDC', direction: 'buy', amountPercent: 0, reasoning: 'LLM empty response — holding' };
      }

      // If model returned tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        // Append assistant message with tool calls to history
        messages.push(message);

        // Process each tool call (gpt-oss-120b does NOT support parallel tool use, but handle loop anyway)
        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function?.name;
          let fnArgs: Record<string, any> = {};
          try {
            fnArgs = JSON.parse(toolCall.function?.arguments || '{}');
          } catch {}

          console.log(`[agent-loop] ${ctx.state.agentName} → ${fnName}(${JSON.stringify(fnArgs)})`);

          const { result, terminal } = await executeToolCall(fnName, fnArgs, ctx);

          // Append tool result to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: fnName,
            content: result,
          });

          // If terminal tool (place_trade or hold), return immediately
          if (terminal) {
            return terminal;
          }
        }

        // Continue loop — model will see tool results and decide next action
        continue;
      }

      // Model returned content without tool calls — try to parse as decision or default to hold
      if (message.content) {
        try {
          const parsed = JSON.parse(message.content);
          if (parsed.action) return parsed;
        } catch {
          // Not JSON — treat content as reasoning for a hold
          return { action: 'hold', pair: 'ETH/USDC', direction: 'buy', amountPercent: 0, reasoning: message.content.slice(0, 200) };
        }
      }

      return { action: 'hold', pair: 'ETH/USDC', direction: 'buy', amountPercent: 0, reasoning: 'LLM no decision — holding' };

    } catch (err: any) {
      console.error(`[agent-loop] LLM call error (iteration ${i}):`, err.message);
      if (i === MAX_ITERATIONS - 1) {
        return { action: 'hold', pair: 'ETH/USDC', direction: 'buy', amountPercent: 0, reasoning: 'LLM error — holding' };
      }
    }
  }

  return { action: 'hold', pair: 'ETH/USDC', direction: 'buy', amountPercent: 0, reasoning: 'max iterations — holding' };
}

// --- Agent tick: the core autonomous loop step ---

export async function agentTick(
  state: AgentArenaState,
  emit: (event: TickEvent) => void,
): Promise<AgentArenaState> {
  const ts = Date.now();

  // Check if stopped
  if (state.stopped) return state;

  // Check drawdown
  if (state.pnl <= -(state.config.maxDrawdown * 100)) {
    emit({
      type: 'stop',
      agentId: state.agentId,
      agentName: state.agentName,
      message: `max drawdown reached (${(state.pnl / 100).toFixed(1)}%)`,
      timestamp: ts,
    });
    return { ...state, stopped: true, stopReason: 'max drawdown' };
  }

  // Trade limit removed — agents trade freely (drawdown check above is the real guardrail)

  // Inject memory into prompt
  const memoryContext = formatMemoryForPrompt(state.agentId);
  const memorySection = memoryContext ? `\n\n${memoryContext}` : '';
  const fullPrompt = state.systemPrompt + memorySection;

  // Kickoff message — agent decides what tools to call
  const kickoff = `It is tick ${state.tickNumber + 1}. You have ${state.config.maxTradesPerRound - state.totalTradesThisRound} trades remaining this round. Your current P&L is ${(state.pnl / 100).toFixed(2)}%. Use your tools to analyze the market and make a decision. End your turn with place_trade or hold.`;

  // Tool context for executeToolCall
  const toolCtx: ToolContext = {
    state,
    emit,
    markets: new Map(),
  };

  // Call Groq agent with tool loop
  const decision = await callGroqAgent(fullPrompt, kickoff, toolCtx);
  console.log(`[agent-loop] ${state.agentName} decision:`, JSON.stringify(decision));

  if (decision.action === 'stop') {
    emit({
      type: 'stop',
      agentId: state.agentId,
      agentName: state.agentName,
      message: `stopping: ${decision.reasoning}`,
      timestamp: Date.now(),
    });
    return { ...state, stopped: true, stopReason: decision.reasoning };
  }

  if (decision.action === 'hold') {
    // Occasionally inject a personality quip
    const quipCategory = state.config.riskTolerance >= 8 ? 'degen' : state.config.contrarian ? 'contrarian' : state.config.riskTolerance <= 4 ? 'conservative' : 'aggressive';
    const quips = QUIPS[quipCategory] || QUIPS.aggressive;
    const useQuip = Math.random() < 0.4;
    const message = useQuip
      ? `${decision.reasoning} ${quips[Math.floor(Math.random() * quips.length)]}`
      : decision.reasoning;

    emit({
      type: 'hold',
      agentId: state.agentId,
      agentName: state.agentName,
      message,
      data: { accentColor: state.accentColor },
      timestamp: Date.now(),
    });
    return { ...state, tickNumber: state.tickNumber + 1 };
  }

  // Execute swap
  emit({
    type: 'decision',
    agentId: state.agentId,
    agentName: state.agentName,
    message: `${decision.direction} ${decision.pair} (${decision.amountPercent}% of portfolio)`,
    data: { decision },
    timestamp: Date.now(),
  });

  // Calculate amount — resolve which token the agent is spending
  let tradeAmount: number; // USD value for display
  let amountIn: bigint;

  // Figure out which token is being spent based on pair + direction
  const { tokenIn: tokenInAddr } = resolveSwapTokens(decision.pair, decision.direction);
  const tokenInSymbol = Object.entries(TOKENS).find(([, t]) => t.address.toLowerCase() === tokenInAddr.toLowerCase())?.[0];
  const tokenInDecimals = tokenInSymbol === 'USDC' || tokenInSymbol === 'USDT' ? 6 : tokenInSymbol === 'WBTC' ? 8 : 18;

  // Map on-chain symbol to portfolio key (portfolio tracks ETH not WETH)
  const portfolioKey = tokenInSymbol === 'WETH' ? 'ETH' : (tokenInSymbol || 'USDC');
  const balance = state.portfolio[portfolioKey] || state.portfolio[tokenInSymbol || 'USDC'] || 0;
  const spendAmount = balance * (decision.amountPercent / 100);
  amountIn = BigInt(Math.round(spendAmount * Math.pow(10, tokenInDecimals)));

  // USD value for display purposes
  if (portfolioKey === 'USDC') {
    tradeAmount = spendAmount;
  } else {
    const market = toolCtx.markets.get(decision.pair);
    tradeAmount = spendAmount * (market?.price || 1);
  }

  // BITE encrypt the trade
  emit({
    type: 'encrypting',
    agentId: state.agentId,
    agentName: state.agentName,
    message: `bite.encryptTransaction({to: SwapRouter, data: 0x${Math.random().toString(16).slice(2, 10)}...})`,
    timestamp: Date.now(),
  });

  try {
    const { encrypted } = await encryptSwapTransaction({
      pair: decision.pair,
      direction: decision.direction,
      amountIn,
      recipient: state.walletAddress,
    });

    // Encrypt reasoning (do early — doesn't depend on swap result)
    const encryptedReasoningData = await encryptReasoning(decision.reasoning);

    // Record trade on-chain using AGENT'S OWN WALLET (so msg.sender == entry.owner)
    let recordTxHash: string | undefined;
    if (state.arenaOnChainId > 0) {
      try {
        emit({
          type: 'recording',
          agentId: state.agentId,
          agentName: state.agentName,
          message: `recording encrypted trade on-chain (PixieArena.recordTrade)...`,
          timestamp: Date.now(),
        });

        // Use placeholder P&L for on-chain record (real P&L calculated after swap)
        const encryptedPnLPlaceholder = await encryptPnL(0);

        const txHash = await writeAgentContract(state.agentId, {
          address: ARENA_ADDRESS,
          abi: PIXIE_ARENA_ABI,
          functionName: 'recordTrade',
          args: [
            BigInt(state.arenaOnChainId),
            BigInt(state.entryIndex),
            toBytes(encrypted),
            toBytes(encryptedPnLPlaceholder),
          ],
          gas: 2000000n,
        });
        await waitForAgentTx(txHash);
        recordTxHash = txHash;
      } catch (chainErr: any) {
        console.error(`[agent-loop] recordTrade on-chain failed for agent ${state.agentName}:`, chainErr.message);
      }
    }

    // Execute REAL swap on Algebra DEX
    let swapTxHash: string | undefined;
    let realSwapSuccess = false;
    let realAmountOut = 0n;
    try {
      const { tokenIn, tokenOut } = resolveSwapTokens(decision.pair, decision.direction);

      emit({
        type: 'recording',
        agentId: state.agentId,
        agentName: state.agentName,
        message: `executing real swap on Algebra DEX — ${decision.direction} ${decision.pair} ($${tradeAmount.toFixed(2)})...`,
        timestamp: Date.now(),
      });

      const result = await executeRealSwap(state.agentId, {
        tokenIn,
        tokenOut,
        amountIn,
        recipient: state.walletAddress as Address,
      });
      swapTxHash = result.txHash;
      realAmountOut = result.amountOut;
      realSwapSuccess = true;
      console.log(`[agent-loop] ${state.agentName} REAL SWAP: ${decision.direction} ${decision.pair} — amountOut: ${realAmountOut}, tx: ${swapTxHash.slice(0, 14)}...`);
    } catch (swapErr: any) {
      console.warn(`[agent-loop] ${state.agentName} real swap failed, falling back to simulation: ${swapErr.message}`);
    }

    // Calculate P&L — real from on-chain balances, or simulated as fallback
    const market = toolCtx.markets.get(decision.pair);
    let pnlBps: number;

    if (realSwapSuccess) {
      // Real P&L from actual on-chain balances
      const startingUsdc = BigInt(Math.round(state.startingValue * 1e6));
      const { pnlBps: realPnl } = await calculateRealPnL(state.agentId, startingUsdc);
      pnlBps = realPnl;
    } else {
      // Fallback to simulated P&L
      pnlBps = simulatePnL(decision, market, state.config);
    }

    // Encrypt real P&L
    const encryptedPnLData = await encryptPnL(pnlBps);

    const trade: TradeResult = {
      pair: decision.pair,
      direction: decision.direction,
      amountIn: tradeAmount,
      encrypted,
      encryptedPnL: encryptedPnLData,
      encryptedReasoning: encryptedReasoningData,
      reasoning: decision.reasoning,
      timestamp: Date.now(),
      simulatedPnL: pnlBps,
      recordTxHash,
      swapTxHash,
      realSwap: realSwapSuccess,
    };

    const swapInfo = swapTxHash ? ` | swap: ${swapTxHash.slice(0, 10)}...` : '';
    emit({
      type: 'executed',
      agentId: state.agentId,
      agentName: state.agentName,
      message: `${decision.direction.toUpperCase()} ${decision.pair} (${decision.amountPercent}%)${realSwapSuccess ? ' [REAL]' : ' [SIM]'}${recordTxHash ? ` — record: ${recordTxHash.slice(0, 10)}...` : ''}${swapInfo}`,
      data: { decision, tradeIndex: state.trades.length, pnlBps, encrypted: String(encrypted).slice(0, 20), recordTxHash, swapTxHash, realSwap: realSwapSuccess },
      timestamp: Date.now(),
    });

    // Update in-memory portfolio tracking
    const newPortfolio = { ...state.portfolio };
    const { tokenIn: swapTokenIn, tokenOut: swapTokenOut } = resolveSwapTokens(decision.pair, decision.direction);
    const inSymbol = Object.entries(TOKENS).find(([, t]) => t.address.toLowerCase() === swapTokenIn.toLowerCase())?.[0] || '';
    const outSymbol = Object.entries(TOKENS).find(([, t]) => t.address.toLowerCase() === swapTokenOut.toLowerCase())?.[0] || '';
    const inKey = inSymbol === 'WETH' ? 'ETH' : inSymbol;
    const outKey = outSymbol === 'WETH' ? 'ETH' : outSymbol;
    const outDecimals = outSymbol === 'USDC' || outSymbol === 'USDT' ? 6 : outSymbol === 'WBTC' ? 8 : 18;

    // Deduct what was spent
    newPortfolio[inKey] = (newPortfolio[inKey] || 0) - spendAmount;
    if (newPortfolio[inKey] < 0.0001) newPortfolio[inKey] = 0;

    // Add what was received
    if (realSwapSuccess && realAmountOut > 0n) {
      newPortfolio[outKey] = (newPortfolio[outKey] || 0) + Number(realAmountOut) / Math.pow(10, outDecimals);
    } else {
      // Simulated: estimate output from market price
      const price = market?.price || 1;
      if (inKey === 'USDC') {
        newPortfolio[outKey] = (newPortfolio[outKey] || 0) + spendAmount / price;
      } else if (outKey === 'USDC') {
        newPortfolio[outKey] = (newPortfolio[outKey] || 0) + spendAmount * price;
      } else {
        newPortfolio[outKey] = (newPortfolio[outKey] || 0) + spendAmount * price;
      }
    }

    return {
      ...state,
      trades: [...state.trades, trade],
      pnl: pnlBps, // Use cumulative real P&L (calculateRealPnL returns total, not delta)
      portfolio: newPortfolio,
      totalTradesThisRound: state.totalTradesThisRound + 1,
      tickNumber: state.tickNumber + 1,
    };
  } catch (err: any) {
    emit({
      type: 'error',
      agentId: state.agentId,
      agentName: state.agentName,
      message: `trade failed: ${err.message}`,
      timestamp: Date.now(),
    });
    return state;
  }
}

// --- Simulate P&L based on market conditions + agent config ---

function simulatePnL(decision: TradeDecision, market: MarketState | undefined, config: AgentConfig): number {
  if (!market) return 0;

  const marketBias = market.priceChange24h / 24;
  const directionMultiplier = decision.direction === 'buy' ? 1 : -1;
  const variance = config.riskTolerance * 15;
  const randomReturn = (Math.random() - 0.45) * variance;
  const trendAlignment = (marketBias * directionMultiplier > 0) ? 20 : -10;
  const contrarianEffect = config.contrarian ? -trendAlignment * 0.5 : 0;

  let pnl = Math.round(randomReturn + trendAlignment + contrarianEffect);
  const stopBps = -(config.stopLoss * 100);
  const takeBps = config.takeProfit * 100;
  pnl = Math.max(stopBps, Math.min(takeBps, pnl));

  return pnl;
}

// --- Create initial agent state ---

export function createAgentState(
  agentId: string,
  config: AgentConfig,
  walletAddress: Address,
  initialUsdc: number,
  arenaOnChainId: number,
  entryIndex: number,
  colorIndex: number = 0,
  arenaId: string = '',
): AgentArenaState {
  initAgentBudget(agentId, 0.50);

  return {
    agentId,
    agentName: config.name,
    config,
    systemPrompt: buildSystemPrompt(config),
    walletAddress,
    arenaOnChainId,
    entryIndex,
    accentColor: AGENT_COLORS[colorIndex % AGENT_COLORS.length],
    portfolio: { USDC: initialUsdc },
    trades: [],
    pnl: 0,
    totalTradesThisRound: 0,
    stopped: false,
    startingValue: initialUsdc,
    tickNumber: 0,
    arenaId,
  };
}

// --- Autonomous agent loop ---

export function startAgentLoop(
  arenaId: string,
  agentId: string,
  tickInterval: number = 15000,
) {
  // Fire first tick immediately (staggered slightly per agent to avoid thundering herd)
  const stagger = Math.random() * 2000; // 0-2s random stagger
  setTimeout(() => runTick(), stagger);

  const interval = setInterval(() => runTick(), tickInterval);

  async function runTick() {
    const arenaStore = getArenaStore();
    const arena = arenaStore.get(arenaId);

    if (!arena || arena.resolved) {
      clearInterval(interval);
      arena?.activeLoops.delete(agentId);
      return;
    }

    // Stop loop when deadline passes — resolveArena handles unwind + P&L
    if (Date.now() > arena.deadline) {
      clearInterval(interval);
      arena.activeLoops.delete(agentId);
      // resolveArena is called by the setTimeout in arena-lifecycle.ts
      return;
    }

    const state = arena.agentStates.get(agentId);
    if (!state || state.stopped) {
      clearInterval(interval);
      arena.activeLoops.delete(agentId);
      return;
    }

    const emit = (event: TickEvent) => {
      arenaStore.addEvent(arenaId, event);
      const entry = arena.entries.find(e => e.agentId === agentId);
      if (entry && event.type === 'executed') {
        entry.tradeCount++;
      }
    };

    try {
      const newState = await agentTick(state, emit);
      arena.agentStates.set(agentId, newState);

      const entry = arena.entries.find(e => e.agentId === agentId);
      if (entry) {
        entry.pnl = newState.pnl;
      }

      if (newState.trades.length > state.trades.length) {
        const { getAgentStore } = await import('./agent-store');
        const agentStore = getAgentStore();
        agentStore.incrementTrades(agentId, newState.trades.length - state.trades.length);
      }
    } catch (err: any) {
      emit({
        type: 'error',
        agentId,
        agentName: state.agentName,
        message: `loop error: ${err.message}`,
        timestamp: Date.now(),
      });
    }
  }
}
