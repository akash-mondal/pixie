// Per-agent ephemeral wallets — each agent gets its own REAL EVM wallet
// Used for x402 payments so agent-to-agent commerce is real wallet-to-wallet
// NOT mock — real private keys, real addresses, real EIP-712 signatures

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, createPublicClient, http, parseAbi, type Address, type Hash } from 'viem';
import { biteSandbox } from './chain';

const RPC_URL = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const USDC_ADDRESS = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
]);

export interface AgentWalletInfo {
  privateKey: `0x${string}`;
  address: Address;
  account: ReturnType<typeof privateKeyToAccount>;
  funded: boolean;
}

// globalThis for HMR persistence
const g = globalThis as any;
function getWalletStore(): Map<string, AgentWalletInfo> {
  if (!g.__pixieAgentWallets) g.__pixieAgentWallets = new Map();
  return g.__pixieAgentWallets;
}

// Create a real ephemeral wallet for an agent
export function createAgentWallet(agentId: string): AgentWalletInfo {
  const store = getWalletStore();

  // Return existing if already created
  const existing = store.get(agentId);
  if (existing) return existing;

  // Generate REAL private key + account
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const wallet: AgentWalletInfo = {
    privateKey,
    address: account.address,
    account,
    funded: false,
  };

  store.set(agentId, wallet);
  console.log(`[agent-wallet] Created wallet for ${agentId}: ${account.address}`);

  return wallet;
}

export function getAgentWallet(agentId: string): AgentWalletInfo | null {
  return getWalletStore().get(agentId) || null;
}

export function getAgentAccount(agentId: string) {
  const wallet = getAgentWallet(agentId);
  if (!wallet) throw new Error(`No wallet for agent ${agentId}`);
  return wallet.account;
}

export function getAgentAddress(agentId: string): Address {
  const wallet = getAgentWallet(agentId);
  if (!wallet) throw new Error(`No wallet for agent ${agentId}`);
  return wallet.address;
}

// Fund an agent wallet with USDC from the server wallet (real on-chain transfer)
// Uses shared server wallet client to avoid nonce conflicts
export async function fundAgentWallet(
  agentId: string,
  amountUsdc: number = 0.50,
): Promise<string | null> {
  const wallet = getAgentWallet(agentId);
  if (!wallet) return null;
  if (wallet.funded) return null; // already funded

  try {
    const { getServerWalletClient } = await import('./server-wallet');
    const walletClient = getServerWalletClient();

    const amountAtomic = BigInt(Math.round(amountUsdc * 1e6));

    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [wallet.address, amountAtomic],
      gas: 100000n,
      type: 'legacy' as any,
    } as any);

    wallet.funded = true;
    console.log(`[agent-wallet] Funded ${agentId} (${wallet.address}) with $${amountUsdc} USDC — tx: ${hash}`);
    return hash;
  } catch (err: any) {
    console.error(`[agent-wallet] Failed to fund ${agentId}:`, err.message);
    // Don't block agent creation on funding failure
    return null;
  }
}

// Track which agents have been funded with sFUEL
const sfuelFunded = new Set<string>();

// Fund an agent wallet with sFUEL from the server wallet (needed for on-chain txs)
// Uses the shared server wallet client to avoid nonce conflicts
export async function fundAgentSfuel(
  agentId: string,
  amountSfuel: bigint = 1000000000000000n, // 0.001 sFUEL — enough for many txs on SKALE
): Promise<string | null> {
  if (sfuelFunded.has(agentId)) return null; // already funded

  const wallet = getAgentWallet(agentId);
  if (!wallet) return null;

  try {
    const { getServerWalletClient, getServerPublicClient } = await import('./server-wallet');

    // Check if agent already has sFUEL
    const pc = getServerPublicClient();
    const balance = await pc.getBalance({ address: wallet.address });
    if (balance > 0n) {
      sfuelFunded.add(agentId);
      return null; // already has sFUEL
    }

    // Use shared server wallet client to avoid nonce races
    const walletClient = getServerWalletClient();

    const hash = await walletClient.sendTransaction({
      to: wallet.address,
      value: amountSfuel,
      gas: 21000n,
      type: 'legacy' as any,
    } as any);

    // Wait for confirmation so the sFUEL is available immediately
    await pc.waitForTransactionReceipt({ hash });
    sfuelFunded.add(agentId);

    console.log(`[agent-wallet] Funded ${agentId} with sFUEL — tx: ${hash}`);
    return hash;
  } catch (err: any) {
    console.error(`[agent-wallet] Failed to fund ${agentId} sFUEL:`, err.message);
    return null;
  }
}

// Write to contract using an agent's own wallet (SKALE legacy tx)
export async function writeAgentContract(
  agentId: string,
  params: {
    address: Address;
    abi: any;
    functionName: string;
    args?: any[];
    value?: bigint;
    gas?: bigint;
  },
): Promise<Hash> {
  const wallet = getAgentWallet(agentId);
  if (!wallet) throw new Error(`No wallet for agent ${agentId}`);

  const walletClient = createWalletClient({
    account: wallet.account,
    chain: biteSandbox,
    transport: http(RPC_URL),
  });

  const hash = await walletClient.writeContract({
    address: params.address,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args ?? [],
    value: params.value ?? 0n,
    gas: params.gas ?? 300000n,
    type: 'legacy' as any,
  } as any);

  return hash;
}

// Wait for tx using public client
export async function waitForAgentTx(hash: Hash) {
  const pc = createPublicClient({
    chain: biteSandbox,
    transport: http(RPC_URL),
  });
  return await pc.waitForTransactionReceipt({ hash });
}

// Reclaim USDC from an agent wallet back to the server wallet
export async function reclaimAgentFunds(agentId: string): Promise<string | null> {
  const wallet = getAgentWallet(agentId);
  if (!wallet) return null;

  try {
    const { getServerAddress, getServerPublicClient } = await import('./server-wallet');
    const serverAddress = getServerAddress();
    const pc = getServerPublicClient();

    // Check USDC balance
    const balance = await pc.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [wallet.address],
    }) as bigint;

    if (balance === 0n) {
      console.log(`[agent-wallet] ${agentId} has no USDC to reclaim`);
      return null;
    }

    // Transfer all USDC back to server
    const walletClient = createWalletClient({
      account: wallet.account,
      chain: biteSandbox,
      transport: http(RPC_URL),
    });

    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [serverAddress, balance],
      gas: 100000n,
      type: 'legacy' as any,
    } as any);

    await pc.waitForTransactionReceipt({ hash });
    const usdcAmount = Number(balance) / 1e6;
    console.log(`[agent-wallet] Reclaimed $${usdcAmount.toFixed(4)} USDC from ${agentId} → server — tx: ${hash.slice(0, 14)}...`);
    return hash;
  } catch (err: any) {
    console.error(`[agent-wallet] Failed to reclaim funds from ${agentId}:`, err.message);
    return null;
  }
}

// Get all created wallets (for debugging/display)
export function getAllAgentWallets(): Array<{ agentId: string; address: Address; funded: boolean }> {
  const store = getWalletStore();
  return Array.from(store.entries()).map(([id, w]) => ({
    agentId: id,
    address: w.address,
    funded: w.funded,
  }));
}
