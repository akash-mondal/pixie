// Server-side wallet for autonomous agent execution
// Uses a private key to sign and submit real transactions on BITE V2 Sandbox 2

import { createWalletClient, createPublicClient, http, parseAbi, decodeEventLog, type Address, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { biteSandbox } from './chain';

const RPC_URL = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const USDC_ADDRESS = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;

const ERC20_APPROVE_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]);

// Use globalThis for HMR persistence — prevents stale nonces and zombie clients
const g = globalThis as any;
function getCachedAccount(): ReturnType<typeof privateKeyToAccount> {
  if (!g.__pixieServerAccount) g.__pixieServerAccount = privateKeyToAccount(getServerPk());
  return g.__pixieServerAccount;
}
function getCachedWalletClient(): ReturnType<typeof createWalletClient> {
  if (!g.__pixieServerWallet) {
    g.__pixieServerWallet = createWalletClient({
      account: getCachedAccount(),
      chain: biteSandbox,
      transport: http(RPC_URL),
    });
  }
  return g.__pixieServerWallet;
}
function getCachedPublicClient(): ReturnType<typeof createPublicClient> {
  if (!g.__pixieServerPublic) {
    g.__pixieServerPublic = createPublicClient({
      chain: biteSandbox,
      transport: http(RPC_URL),
    });
  }
  return g.__pixieServerPublic;
}

function getServerPk(): `0x${string}` {
  const pk = process.env.SERVER_PK;
  if (!pk) throw new Error('SERVER_PK not set');
  return pk as `0x${string}`;
}

export function getServerAccount() {
  return getCachedAccount();
}

export function getServerWalletClient() {
  return getCachedWalletClient();
}

export function getServerPublicClient() {
  return getCachedPublicClient();
}

export function getServerAddress(): Address {
  return getServerAccount().address;
}

// Send a legacy transaction (SKALE requires type: 0)
export async function sendServerTx(params: {
  to: Address;
  data: `0x${string}`;
  value?: bigint;
  gas?: bigint;
}): Promise<Hash> {
  const walletClient = getServerWalletClient();
  const hash = await walletClient.sendTransaction({
    to: params.to,
    data: params.data,
    value: params.value ?? 0n,
    gas: params.gas ?? 500000n,
    type: 'legacy' as any,
  } as any);
  return hash;
}

// Write to contract with legacy tx
export async function writeServerContract(params: {
  address: Address;
  abi: any;
  functionName: string;
  args?: any[];
  value?: bigint;
  gas?: bigint;
}): Promise<Hash> {
  const walletClient = getServerWalletClient();
  const hash = await walletClient.writeContract({
    address: params.address,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args ?? [],
    value: params.value ?? 0n,
    gas: params.gas ?? 500000n,
    type: 'legacy' as any,
  } as any);
  return hash;
}

// Wait for tx receipt
export async function waitForTx(hash: Hash) {
  const pc = getServerPublicClient();
  return await pc.waitForTransactionReceipt({ hash });
}

// Parse a specific event from a tx receipt
export function parseEvent(receipt: any, abi: any[], eventName: string): any | null {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics }) as any;
      if (decoded.eventName === eventName) return decoded.args;
    } catch { /* skip non-matching logs */ }
  }
  return null;
}

// Ensure USDC approved to spender (idempotent, caches approvals)
const approvedSpenders = new Set<string>();

export async function ensureUsdcApproval(spender: Address) {
  if (approvedSpenders.has(spender)) return;

  const maxUint = 2n ** 256n - 1n;

  // Check current allowance
  const pc = getServerPublicClient();
  const allowance = await pc.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_APPROVE_ABI,
    functionName: 'allowance',
    args: [getServerAddress(), spender],
  });

  if ((allowance as bigint) >= maxUint / 2n) {
    approvedSpenders.add(spender);
    return;
  }

  // Approve max
  console.log(`[server-wallet] Approving USDC to ${spender}...`);
  const hash = await writeServerContract({
    address: USDC_ADDRESS,
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [spender, maxUint],
  });
  await waitForTx(hash);
  approvedSpenders.add(spender);
  console.log(`[server-wallet] USDC approved: ${hash}`);
}

// Convert hex string to 0x-prefixed bytes for contract calls
export function toBytes(hex: string): `0x${string}` {
  if (hex.startsWith('0x')) return hex as `0x${string}`;
  return `0x${hex}` as `0x${string}`;
}
