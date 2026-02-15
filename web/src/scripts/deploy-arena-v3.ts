#!/usr/bin/env npx tsx
// Deploy PixieArenaV3 to BITE V2 Sandbox 2 via viem
// Usage: npx tsx src/scripts/deploy-arena-v3.ts

import { createWalletClient, createPublicClient, http, encodeAbiParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';

const RPC_URL = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const CHAIN_ID = 103698795;

// Constructor args
const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8';
const SWAP_ROUTER = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb';
const WETH = '0xd74190a1b2a69c2f123a0df16ba21959a01eb843';
const WBTC = '0x26b1f043545118103097767184c419f12b5a3e88';

async function main() {
  const pk = process.env.SERVER_PK;
  if (!pk) throw new Error('Set SERVER_PK env var');

  // Read compiled artifact from Foundry
  const artifactPath = path.resolve(
    __dirname, '..', '..', '..', 'gamified-lp', 'contracts', 'out',
    'PixieArenaV3.sol', 'PixieArenaV3.json'
  );
  console.log('Reading artifact from:', artifactPath);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  const bytecode = artifact.bytecode.object as `0x${string}`;
  console.log('Bytecode size:', bytecode.length / 2, 'bytes');

  // Encode constructor args: (address _token, address _swapRouter, address _weth, address _wbtc)
  const constructorArgs = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }],
    [USDC as `0x${string}`, SWAP_ROUTER as `0x${string}`, WETH as `0x${string}`, WBTC as `0x${string}`]
  );

  const deployData = (bytecode + constructorArgs.slice(2)) as `0x${string}`;

  const chain = {
    id: CHAIN_ID,
    name: 'BITE V2 Sandbox 2',
    nativeCurrency: { name: 'sFUEL', symbol: 'sFUEL', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  } as const;

  const account = privateKeyToAccount(pk as `0x${string}`);
  console.log('Deploying from:', account.address);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(RPC_URL),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL),
  });

  console.log('Sending deploy transaction...');
  const hash = await walletClient.sendTransaction({
    data: deployData,
    gas: 10000000n,
    type: 'legacy' as any,
  } as any);
  console.log('Deploy tx:', hash);

  console.log('Waiting for receipt...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('');
  console.log('========================================');
  console.log('PixieArenaV3 DEPLOYED');
  console.log('Address:', receipt.contractAddress);
  console.log('Tx hash:', hash);
  console.log('Block:', receipt.blockNumber);
  console.log('========================================');
  console.log('');
  console.log('Add to .env.local:');
  console.log(`NEXT_PUBLIC_ARENA_V3_ADDRESS=${receipt.contractAddress}`);
}

main().catch((err) => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
