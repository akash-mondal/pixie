#!/usr/bin/env npx tsx
// Deploy fresh ERC20 tokens for clean Algebra pools
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { createWalletClient, createPublicClient, http, type Address, encodeDeployData, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const chain = { id: 103698795, name: 'BITE V2', nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' }, rpcUrls: { default: { http: [RPC] } } } as const;
const account = privateKeyToAccount(process.env.SERVER_PK as `0x${string}`);
const pc = createPublicClient({ chain: chain as any, transport: http(RPC) });
const wc = createWalletClient({ account, chain: chain as any, transport: http(RPC) });

// Load compiled bytecode from forge output
const artifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../contracts/out/TestToken.sol/TestToken.json'), 'utf-8'));
const bytecode = artifact.bytecode.object as Hex;
const abi = artifact.abi;

async function deployToken(name: string, symbol: string, decimals: number): Promise<Address> {
  console.log(`\nDeploying ${name} (${symbol}, ${decimals} decimals)...`);

  const deployData = encodeDeployData({ abi, bytecode, args: [name, symbol, decimals] });

  const hash = await wc.sendTransaction({
    data: deployData,
    gas: 3000000n,
    type: 'legacy' as any,
  } as any);

  console.log(`  tx: ${hash}`);
  const receipt = await pc.waitForTransactionReceipt({ hash });

  if (receipt.status === 'reverted' || !receipt.contractAddress) {
    throw new Error(`Deploy reverted: ${hash}`);
  }

  console.log(`  deployed to: ${receipt.contractAddress}`);
  return receipt.contractAddress as Address;
}

async function main() {
  console.log('Server:', account.address);

  const weth = await deployToken('Wrapped Ether', 'WETH', 18);
  const wbtc = await deployToken('Wrapped Bitcoin', 'WBTC', 8);

  console.log('\n=== DEPLOYED TOKENS ===');
  console.log(`WETH: ${weth}`);
  console.log(`WBTC: ${wbtc}`);

  // Mint tokens to server
  console.log('\nMinting tokens...');
  for (const [name, addr, amount] of [
    ['WETH', weth, 1000n * 10n**18n],
    ['WBTC', wbtc, 100n * 10n**8n],
  ] as const) {
    const hash = await wc.writeContract({
      address: addr, abi, functionName: 'mint',
      args: [account.address, amount],
      gas: 100000n, type: 'legacy' as any,
    } as any);
    await pc.waitForTransactionReceipt({ hash });
    console.log(`  Minted ${name}: ${hash.slice(0, 14)}...`);
  }

  console.log('\n=== UPDATE algebra.ts WITH THESE ADDRESSES ===');
  console.log(`export const WETH_ADDRESS = '${weth}' as Address;`);
  console.log(`export const WBTC_ADDRESS = '${wbtc}' as Address;`);
}

main().catch(console.error);
