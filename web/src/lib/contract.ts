// GamifiedLP contract — ABI + viem read/write helpers

import { createPublicClient, http, parseAbi, formatUnits, type Address } from 'viem';
import { biteSandbox } from './chain';

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0xEe40a91495CC60eF465C838Cc35de2d7C0Beba29') as Address;
export const USDC_ADDRESS = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;

export const GAMIFIED_LP_ABI = parseAbi([
  'function createPool(uint256 deadline, uint256 minDepositors, uint256 maxDepositors, uint256 minDeposit, uint256 maxDeposit, uint256 rewardAmount, uint256 gracePeriod) external returns (uint256)',
  'function deposit(uint256 poolId, uint256 amount, bytes encryptedStrategy) external',
  'function resolve(uint256 poolId) external payable',
  'function claimReward(uint256 poolId, uint256 depositIndex) external',
  'function getPool(uint256 poolId) external view returns (address creator, uint256 depositDeadline, uint256 minDepositors, uint256 maxDepositors, uint256 depositCount, uint256 totalDeposited, uint256 rewardAmount, bool resolved, uint256 totalWeight)',
  'function getDeposit(uint256 poolId, uint256 index) external view returns (address depositor, uint256 amount, int24 tickLower, int24 tickUpper, uint256 lockDays, bool revealed, bool claimed)',
  'function poolCount() external view returns (uint256)',
  'event PoolCreated(uint256 indexed poolId, address creator, uint256 deadline, uint256 minDepositors, uint256 rewardAmount)',
  'event DepositMade(uint256 indexed poolId, address depositor, uint256 amount, uint256 index)',
]);

export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]);

export const publicClient = createPublicClient({
  chain: biteSandbox,
  transport: http(),
});

export function parseUsdc(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

export function formatUsdc(amount: bigint): string {
  return formatUnits(amount, 6);
}

// --- Read functions ---

export async function getPoolCount(): Promise<number> {
  const count = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GAMIFIED_LP_ABI,
    functionName: 'poolCount',
  });
  return Number(count);
}

export interface PoolInfo {
  poolId: number;
  creator: string;
  depositDeadline: number;
  minDepositors: number;
  maxDepositors: number;
  depositCount: number;
  totalDeposited: bigint;
  rewardAmount: bigint;
  resolved: boolean;
  totalWeight: bigint;
}

export async function getPool(poolId: number): Promise<PoolInfo> {
  const result = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GAMIFIED_LP_ABI,
    functionName: 'getPool',
    args: [BigInt(poolId)],
  });
  return {
    poolId,
    creator: result[0],
    depositDeadline: Number(result[1]),
    minDepositors: Number(result[2]),
    maxDepositors: Number(result[3]),
    depositCount: Number(result[4]),
    totalDeposited: result[5],
    rewardAmount: result[6],
    resolved: result[7],
    totalWeight: result[8],
  };
}

export interface DepositInfo {
  index: number;
  depositor: string;
  amount: bigint;
  tickLower: number;
  tickUpper: number;
  lockDays: number;
  revealed: boolean;
  claimed: boolean;
}

export async function getDeposit(poolId: number, index: number): Promise<DepositInfo> {
  const result = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GAMIFIED_LP_ABI,
    functionName: 'getDeposit',
    args: [BigInt(poolId), BigInt(index)],
  });
  return {
    index,
    depositor: result[0],
    amount: result[1],
    tickLower: Number(result[2]),
    tickUpper: Number(result[3]),
    lockDays: Number(result[4]),
    revealed: result[5],
    claimed: result[6],
  };
}

export async function listPools() {
  const count = await getPoolCount();
  const pools: PoolInfo[] = [];
  for (let i = 0; i < count; i++) {
    try {
      pools.push(await getPool(i));
    } catch { /* skip invalid */ }
  }
  return pools;
}

export async function getPoolWithDeposits(poolId: number) {
  const pool = await getPool(poolId);
  const deposits: DepositInfo[] = [];
  for (let i = 0; i < pool.depositCount; i++) {
    deposits.push(await getDeposit(poolId, i));
  }
  return { pool, deposits };
}
