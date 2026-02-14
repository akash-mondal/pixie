// Pool Manager — wraps LPContract for API use, reads pool data from chain

import { ethers } from 'ethers';
import { CHAIN, CONTRACTS, GAMIFIED_LP_ABI, ERC20_ABI, parseUsdc, formatUsdc } from '../../src/config.js';
import { LPContract, type PoolInfo, type DepositInfo } from '../../src/lp-contract.js';
import { encryptStrategy, type LPStrategy } from '../../src/bite-client.js';
import { fetchPoolData, formatPoolSummary, type PoolData } from '../../src/algebra-data.js';
import { initLLM, getLLMUsage } from '../../src/llm-client.js';
import {
  alphaAgent, betaAgent, gammaAgent, deltaAgent, epsilonAgent,
  type AgentResult,
} from '../../src/agent-strategies.js';

let provider: ethers.JsonRpcProvider;
let operatorWallet: ethers.Wallet;
let agentWallets: ethers.Wallet[];
let lpContract: LPContract;
let contractAddress: string;

const AGENT_FUNCTIONS: Record<string, (pool: PoolData) => Promise<AgentResult>> = {
  alpha: alphaAgent,
  beta: betaAgent,
  gamma: gammaAgent,
  delta: deltaAgent,
  epsilon: epsilonAgent,
};

export function initPoolManager() {
  const rpcUrl = process.env.RPC_URL!;
  contractAddress = process.env.GAMIFIED_LP_ADDRESS!;

  provider = new ethers.JsonRpcProvider(rpcUrl, CHAIN.chainId);
  operatorWallet = new ethers.Wallet(process.env.BUYER_PK!, provider);

  agentWallets = [
    new ethers.Wallet(process.env.BUYER_PK!, provider),
    new ethers.Wallet(process.env.PROVIDER1_PK!, provider),
    new ethers.Wallet(process.env.PROVIDER2_PK!, provider),
    new ethers.Wallet(process.env.PROVIDER3_PK!, provider),
  ];

  CONTRACTS.gamifiedLP = contractAddress;
  lpContract = new LPContract(provider, operatorWallet, contractAddress);

  initLLM(process.env.GROQ_API_KEY!, process.env.LLM_MODEL);
}

export function getContractAddress() { return contractAddress; }
export function getProvider() { return provider; }

export async function getPoolCount(): Promise<number> {
  const contract = new ethers.Contract(contractAddress, GAMIFIED_LP_ABI, provider);
  return Number(await contract.poolCount());
}

export async function getPool(poolId: number): Promise<PoolInfo & { poolId: number }> {
  const info = await lpContract.getPool(poolId);
  return { ...info, poolId };
}

export async function getPoolWithDeposits(poolId: number) {
  const pool = await getPool(poolId);
  const deposits: (DepositInfo & { index: number })[] = [];

  for (let i = 0; i < pool.depositCount; i++) {
    const dep = await lpContract.getDeposit(poolId, i);
    deposits.push({ ...dep, index: i });
  }

  return { pool, deposits };
}

export async function listPools() {
  const count = await getPoolCount();
  const pools = [];
  for (let i = 0; i < count; i++) {
    try {
      const pool = await getPool(i);
      pools.push(pool);
    } catch { /* skip invalid pools */ }
  }
  return pools;
}

export async function createPool(params: {
  rewardAmount: number;
  deadlineMinutes: number;
  minDepositors: number;
  maxDepositors: number;
  minDeposit: number;
  maxDeposit: number;
  gracePeriod: number;
}) {
  const deadline = Math.floor(Date.now() / 1000) + params.deadlineMinutes * 60;
  const result = await lpContract.createPool({
    deadline,
    minDepositors: params.minDepositors,
    maxDepositors: params.maxDepositors,
    minDeposit: parseUsdc(params.minDeposit),
    maxDeposit: parseUsdc(params.maxDeposit),
    rewardAmount: parseUsdc(params.rewardAmount),
    gracePeriod: params.gracePeriod,
  });
  return result;
}

export async function resolvePool(poolId: number) {
  const txHash = await lpContract.resolve(poolId, '0.001');
  return txHash;
}

export interface AgentRunEvent {
  type: 'status' | 'strategy' | 'encrypting' | 'depositing' | 'done' | 'error';
  message: string;
  data?: any;
}

export async function* runAgent(
  poolId: number,
  agentType: string,
  depositAmount: number,
): AsyncGenerator<AgentRunEvent> {
  const agentFn = AGENT_FUNCTIONS[agentType.toLowerCase()];
  if (!agentFn) {
    yield { type: 'error', message: `Unknown agent type: ${agentType}` };
    return;
  }

  // Pick a wallet for this agent
  const walletIndex = Object.keys(AGENT_FUNCTIONS).indexOf(agentType.toLowerCase()) % agentWallets.length;
  const wallet = agentWallets[walletIndex];

  yield { type: 'status', message: `Analyzing Algebra Finance pool data...` };

  const poolData = await fetchPoolData();
  const result = await agentFn(poolData);

  yield {
    type: 'strategy',
    message: `Strategy computed: ticks [${result.strategy.tickLower.toLocaleString()} — ${result.strategy.tickUpper.toLocaleString()}] lock=${result.strategy.lockDays}d`,
    data: {
      name: result.name,
      description: result.description,
      aiQuality: result.aiQuality,
      tickLower: result.strategy.tickLower,
      tickUpper: result.strategy.tickUpper,
      lockDays: result.strategy.lockDays,
      efficiency: result.efficiency,
      ilRisk: result.ilRisk,
      reasoning: result.reasoning,
    },
  };

  yield { type: 'encrypting', message: `BITE encrypting strategy...` };

  const rpcUrl = process.env.RPC_URL!;
  const encrypted = await encryptStrategy(rpcUrl, result.strategy);

  yield { type: 'encrypting', message: `ENCRYPTED (${encrypted.length} bytes)` };

  yield { type: 'depositing', message: `Depositing $${depositAmount} to Pool #${poolId}...` };

  // Fund wallet if needed
  const usdcContract = new ethers.Contract(CONTRACTS.usdc, ERC20_ABI, operatorWallet);
  const amount = parseUsdc(depositAmount);
  if (wallet.address !== operatorWallet.address) {
    const bal = await usdcContract.balanceOf(wallet.address);
    if (bal < amount) {
      const fundTx = await usdcContract.transfer(wallet.address, parseUsdc(1), { type: 0, gasLimit: 100000 });
      await fundTx.wait();
    }
  }

  const depResult = await lpContract.deposit(poolId, amount, encrypted, wallet);

  yield {
    type: 'done',
    message: `Deposit confirmed`,
    data: {
      txHash: depResult.txHash,
      index: depResult.index,
      agent: result.name,
      depositAmount,
    },
  };
}

export async function getMarketData() {
  const poolData = await fetchPoolData();
  const llmUsage = getLLMUsage();
  return {
    pool: poolData,
    summary: formatPoolSummary(poolData),
    llmUsage,
  };
}

export async function fundSfuel(targetAddress: string) {
  const balance = await provider.getBalance(targetAddress);
  const threshold = ethers.parseEther('0.005');
  if (balance >= threshold) {
    return { funded: false, txHash: '' };
  }

  const tx = await operatorWallet.sendTransaction({
    to: targetAddress,
    value: ethers.parseEther('0.01'),
    type: 0,
    gasLimit: 21000,
  });
  await tx.wait();
  return { funded: true, txHash: tx.hash };
}
