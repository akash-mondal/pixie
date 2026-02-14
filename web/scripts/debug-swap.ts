import * as fs from 'fs';
import * as path from 'path';
const envPath = path.resolve(__dirname, '../.env.local');
const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
for (const line of lines) {
  const t = line.trim();
  if (t.length === 0 || t[0] === '#') continue;
  const i = t.indexOf('=');
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

import { createWalletClient, createPublicClient, http, type Address, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const chain = { id: 103698795, name: 'BITE V2', nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' }, rpcUrls: { default: { http: [RPC] } } } as const;
const account = privateKeyToAccount(process.env.SERVER_PK as `0x${string}`);
const pc = createPublicClient({ chain: chain as any, transport: http(RPC) });
const wc = createWalletClient({ account, chain: chain as any, transport: http(RPC) });

const SR = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb' as Address;
const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const WETH = '0x4c1928684b7028c2805fa1d12aced5c839a8d42c' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;

const SWAP_ABI = [{
  name: 'exactInputSingle', type: 'function' as const, stateMutability: 'payable' as const,
  inputs: [{ name: 'params', type: 'tuple' as const, components: [
    { name: 'tokenIn', type: 'address' as const }, { name: 'tokenOut', type: 'address' as const },
    { name: 'deployer', type: 'address' as const }, { name: 'recipient', type: 'address' as const },
    { name: 'deadline', type: 'uint256' as const }, { name: 'amountIn', type: 'uint256' as const },
    { name: 'amountOutMinimum', type: 'uint256' as const }, { name: 'limitSqrtPrice', type: 'uint160' as const },
  ] }],
  outputs: [{ name: 'amountOut', type: 'uint256' as const }],
}] as const;

async function main() {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const amountIn = 10000000000000n; // 0.00001 WETH

  // 1. Simulate with eth_call
  const calldata = encodeFunctionData({
    abi: SWAP_ABI, functionName: 'exactInputSingle',
    args: [{ tokenIn: WETH, tokenOut: USDC, deployer: ZERO, recipient: account.address, deadline, amountIn, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
  });

  console.log('Simulating 0.00001 WETH → USDC...');
  try {
    const result = await pc.call({ to: SR, data: calldata, account: account.address, gas: 10000000n });
    console.log('eth_call result:', result);
  } catch (e: any) {
    console.log('eth_call error:', e.shortMessage || e.message?.slice(0, 400));
  }

  // 2. Try actual swap
  console.log('\nExecuting swap...');
  try {
    const hash = await wc.writeContract({
      address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn: WETH, tokenOut: USDC, deployer: ZERO, recipient: account.address, deadline, amountIn, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
      gas: 10000000n, type: 'legacy' as any,
    } as any);
    const receipt = await pc.waitForTransactionReceipt({ hash });
    console.log('Status:', receipt.status, 'Logs:', receipt.logs.length);
    for (const log of receipt.logs.slice(0, 3)) {
      console.log('  Log:', log.address.slice(0, 12), 'topic0:', log.topics[0]?.slice(0, 10), 'data:', log.data?.slice(0, 30));
    }
  } catch (e: any) {
    console.log('Swap error:', e.shortMessage || e.message?.slice(0, 400));
  }
}

main().catch(console.error);
