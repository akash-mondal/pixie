// GamifiedLP contract client — ethers.js wrapper for on-chain interactions

import { ethers } from 'ethers';
import { GAMIFIED_LP_ABI, ERC20_ABI, CONTRACTS } from './config.js';

export interface PoolParams {
  deadline: number; // unix timestamp
  minDepositors: number;
  maxDepositors: number;
  minDeposit: bigint; // USDC amount in 6 decimals
  maxDeposit: bigint;
  rewardAmount: bigint;
  gracePeriod: number; // blocks
}

export interface PoolInfo {
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

export interface DepositInfo {
  depositor: string;
  amount: bigint;
  tickLower: number;
  tickUpper: number;
  lockDays: number;
  revealed: boolean;
  claimed: boolean;
}

export class LPContract {
  private contract: ethers.Contract;
  private usdc: ethers.Contract;
  private contractAddress: string;

  constructor(
    private provider: ethers.JsonRpcProvider,
    private signer: ethers.Wallet,
    contractAddress: string,
  ) {
    this.contractAddress = contractAddress;
    this.contract = new ethers.Contract(contractAddress, GAMIFIED_LP_ABI, this.signer);
    this.usdc = new ethers.Contract(CONTRACTS.usdc, ERC20_ABI, this.signer);
  }

  async approveUsdc(amount: bigint): Promise<string> {
    const tx = await this.usdc.approve(this.contractAddress, amount, { type: 0, gasLimit: 100000 });
    const receipt = await tx.wait();
    return receipt!.hash;
  }

  async createPool(params: PoolParams): Promise<{ poolId: number; txHash: string }> {
    // Approve USDC for reward
    await this.approveUsdc(params.rewardAmount);

    const tx = await this.contract.createPool(
      params.deadline,
      params.minDepositors,
      params.maxDepositors,
      params.minDeposit,
      params.maxDeposit,
      params.rewardAmount,
      params.gracePeriod,
      { type: 0, gasLimit: 500000 },
    );
    const receipt = await tx.wait();

    // Parse PoolCreated event
    const iface = new ethers.Interface(GAMIFIED_LP_ABI);
    let poolId = 0;
    for (const log of receipt!.logs) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'PoolCreated') {
          poolId = Number(parsed.args[0]);
        }
      } catch { /* skip */ }
    }

    return { poolId, txHash: tx.hash };
  }

  async deposit(poolId: number, amount: bigint, encryptedStrategy: string, signerOverride?: ethers.Wallet): Promise<{ txHash: string; index: number }> {
    const contract = signerOverride
      ? new ethers.Contract(this.contractAddress, GAMIFIED_LP_ABI, signerOverride)
      : this.contract;
    const usdcContract = signerOverride
      ? new ethers.Contract(CONTRACTS.usdc, ERC20_ABI, signerOverride)
      : this.usdc;

    // Approve
    const approveTx = await usdcContract.approve(this.contractAddress, amount, { type: 0, gasLimit: 100000 });
    await approveTx.wait();

    // Deposit
    const encBytes = ethers.getBytes(encryptedStrategy);
    const tx = await contract.deposit(poolId, amount, encBytes, { type: 0, gasLimit: 500000 });
    const receipt = await tx.wait();

    // Parse DepositMade event
    const iface = new ethers.Interface(GAMIFIED_LP_ABI);
    let index = 0;
    for (const log of receipt!.logs) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'DepositMade') {
          index = Number(parsed.args[3]);
        }
      } catch { /* skip */ }
    }

    return { txHash: tx.hash, index };
  }

  async resolve(poolId: number, valueSfuel = '0'): Promise<string> {
    const tx = await this.contract.resolve(poolId, {
      type: 0,
      gasLimit: 2000000,
      value: ethers.parseEther(valueSfuel || '0'),
    });
    const receipt = await tx.wait();
    return tx.hash;
  }

  async claimReward(poolId: number, depositIndex: number, signerOverride?: ethers.Wallet): Promise<{ txHash: string; reward: bigint }> {
    const contract = signerOverride
      ? new ethers.Contract(this.contractAddress, GAMIFIED_LP_ABI, signerOverride)
      : this.contract;

    const tx = await contract.claimReward(poolId, depositIndex, { type: 0, gasLimit: 300000 });
    const receipt = await tx.wait();

    // Parse RewardClaimed event
    const iface = new ethers.Interface(GAMIFIED_LP_ABI);
    let reward = 0n;
    for (const log of receipt!.logs) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'RewardClaimed') {
          reward = parsed.args[3]; // reward amount
        }
      } catch { /* skip */ }
    }

    return { txHash: tx.hash, reward };
  }

  async getPool(poolId: number): Promise<PoolInfo> {
    const result = await this.contract.getPool(poolId);
    return {
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

  async getDeposit(poolId: number, index: number): Promise<DepositInfo> {
    const result = await this.contract.getDeposit(poolId, index);
    return {
      depositor: result[0],
      amount: result[1],
      tickLower: Number(result[2]),
      tickUpper: Number(result[3]),
      lockDays: Number(result[4]),
      revealed: result[5],
      claimed: result[6],
    };
  }
}
