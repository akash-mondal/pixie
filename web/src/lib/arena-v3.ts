// PixieArenaV3 — ABI + address for sealed conviction orders with CTX swap execution

import { parseAbi, type Address } from 'viem';

export const ARENA_V3_ADDRESS = (process.env.NEXT_PUBLIC_ARENA_V3_ADDRESS || '0x3f500bb7e5fd5d7e08dd9632dba2d635c0552433') as Address;

export const PIXIE_ARENA_V3_ABI = parseAbi([
  // --- Existing arena functions ---
  'function createArena(uint256 entryFee, uint256 maxAgents, uint256 duration, uint256 prizeAmount) external returns (uint256)',
  'function joinArena(uint256 arenaId, uint256 agentId, bytes encryptedStrategy) external returns (uint256)',
  'function recordTrade(uint256 arenaId, uint256 entryIndex, bytes encryptedTxHash, bytes encryptedPnL) external',
  'function finalizeArena(uint256 arenaId) external payable',
  'function claimPrize(uint256 arenaId, uint256 entryIndex) external',

  // --- Sealed order functions (NEW) ---
  'function depositTokens(uint256 arenaId, uint256 entryIndex, address tokenAddr, uint256 amount) external',
  'function submitSealedOrder(uint256 arenaId, uint256 entryIndex, bytes encryptedOrderData) external',
  'function withdrawDeposit(uint256 arenaId, uint256 entryIndex) external',
  'function emergencyWithdrawDeposit(uint256 arenaId, uint256 entryIndex) external',

  // --- View functions ---
  'function getArena(uint256 arenaId) external view returns (address creator, uint256 entryFee, uint256 prizePool, uint256 maxAgents, uint256 deadline, uint256 entryCount, bool resolved, uint256 sealedOrderCount)',
  'function getEntry(uint256 arenaId, uint256 index) external view returns (address owner, uint256 agentId, uint256 tradeCount, int256 revealedPnL, bool revealed, bool claimed)',
  'function getTradeCount(uint256 arenaId, uint256 entryIndex) external view returns (uint256)',
  'function getSealedOrderCount(uint256 arenaId) external view returns (uint256)',
  'function getSealedOrder(uint256 arenaId, uint256 orderIndex) external view returns (uint256 entryIndex, bool executed, uint256 amountOut)',
  'function getDeposit(uint256 arenaId, uint256 entryIndex) external view returns (uint256 usdc, uint256 wethBal, uint256 wbtcBal)',

  // --- Events ---
  'event ArenaCreated(uint256 indexed arenaId, address creator, uint256 entryFee, uint256 maxAgents, uint256 deadline, uint256 prizePool)',
  'event AgentJoined(uint256 indexed arenaId, address owner, uint256 agentId, uint256 entryIndex)',
  'event TradeRecorded(uint256 indexed arenaId, uint256 entryIndex, uint256 tradeIndex)',
  'event ArenaFinalized(uint256 indexed arenaId, uint256 entryCount, uint256 sealedOrderCount)',
  'event StrategiesRevealed(uint256 indexed arenaId, uint256 count)',
  'event TokensDeposited(uint256 indexed arenaId, uint256 entryIndex, address tokenAddr, uint256 amount)',
  'event SealedOrderSubmitted(uint256 indexed arenaId, uint256 entryIndex, uint256 orderIndex)',
  'event SealedOrderExecuted(uint256 indexed arenaId, uint256 entryIndex, uint256 orderIndex, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',
  'event SealedOrderFailed(uint256 indexed arenaId, uint256 orderIndex, address tokenIn, address tokenOut, uint256 amountIn)',
  'event DepositWithdrawn(uint256 indexed arenaId, uint256 entryIndex)',
]);
