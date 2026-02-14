#!/usr/bin/env npx tsx
// Verify swap works with 12M gas on new pools, then check current prices
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

import { createWalletClient, createPublicClient, http, type Address, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const chain = { id: 103698795, name: 'BITE V2', nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' }, rpcUrls: { default: { http: [RPC] } } } as const;
const account = privateKeyToAccount(process.env.SERVER_PK as `0x${string}`);
const pc = createPublicClient({ chain: chain as any, transport: http(RPC) });
const wc = createWalletClient({ account, chain: chain as any, transport: http(RPC) });

const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const WETH = '0x40f7c49d1310ef5e1f2bd3a31bee123ac70cf518' as Address;
const WBTC = '0x63fcc83709a0af768675c1daaf5ec60832232aee' as Address;
const SR = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb' as Address;
const QUOTER = '0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;

const SWAP_ABI = [{
  name: 'exactInputSingle', type: 'function' as const, stateMutability: 'payable' as const,
  inputs: [{ name: 'params', type: 'tuple' as const, components: [
    { name: 'tokenIn', type: 'address' as const }, { name: 'tokenOut', type: 'address' as const },
    { name: 'deployer', type: 'address' as const }, { name: 'recipient', type: 'address' as const },
    { name: 'deadline', type: 'uint256' as const }, { name: 'amountIn', type: 'uint256' as const },
    { name: 'amountOutMinimum', type: 'uint256' as const }, { name: 'limitSqrtPrice', type: 'uint160' as const },
  ]}],
  outputs: [{ name: 'amountOut', type: 'uint256' as const }],
}] as const;

const QUOTER_ABI = [{
  name: 'quoteExactInputSingle', type: 'function' as const, stateMutability: 'nonpayable' as const,
  inputs: [{ name: 'params', type: 'tuple' as const, components: [
    { name: 'tokenIn', type: 'address' as const }, { name: 'tokenOut', type: 'address' as const },
    { name: 'deployer', type: 'address' as const }, { name: 'amountIn', type: 'uint256' as const },
    { name: 'limitSqrtPrice', type: 'uint160' as const },
  ]}],
  outputs: [{ name: 'amountOut', type: 'uint256' as const }, { name: 'fee', type: 'uint16' as const }],
}] as const;

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
]);

async function main() {
  console.log('=== CURRENT QUOTES (showing what pool prices look like) ===');
  const quoteTests = [
    { name: '1 USDC → WETH', tIn: USDC, tOut: WETH, amt: 1000000n, decOut: 18, symOut: 'WETH' },
    { name: '0.001 WETH → USDC', tIn: WETH, tOut: USDC, amt: 10n**15n, decOut: 6, symOut: 'USDC' },
    { name: '1 USDC → WBTC', tIn: USDC, tOut: WBTC, amt: 1000000n, decOut: 8, symOut: 'WBTC' },
    { name: '0.0001 WBTC → USDC', tIn: WBTC, tOut: USDC, amt: 10000n, decOut: 6, symOut: 'USDC' },
  ];

  for (const qt of quoteTests) {
    try {
      const r = await pc.readContract({
        address: QUOTER, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: qt.tIn, tokenOut: qt.tOut, deployer: ZERO, amountIn: qt.amt, limitSqrtPrice: 0n }],
      });
      console.log(`  ${qt.name} → ${(Number(r[0]) / Math.pow(10, qt.decOut)).toFixed(8)} ${qt.symOut}`);
    } catch (e: any) {
      console.log(`  ${qt.name} → FAILED`);
    }
  }

  // Test swap USDC → WETH with 12M gas
  console.log('\n=== SWAP: 0.10 USDC → WETH (12M gas) ===');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const usdcBefore = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const wethBefore = await pc.readContract({ address: WETH, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;

  try {
    const hash = await wc.writeContract({
      address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn: USDC, tokenOut: WETH, deployer: ZERO, recipient: account.address, deadline,
        amountIn: 100000n, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
      gas: 12000000n, type: 'legacy' as any,
    } as any);
    const receipt = await pc.waitForTransactionReceipt({ hash });

    const usdcAfter = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
    const wethAfter = await pc.readContract({ address: WETH, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;

    console.log(`  Status: ${receipt.status}, gasUsed: ${receipt.gasUsed}`);
    console.log(`  USDC: ${Number(usdcBefore)/1e6} → ${Number(usdcAfter)/1e6} (delta: ${Number(usdcAfter - usdcBefore)/1e6})`);
    console.log(`  WETH: ${Number(wethBefore)/1e18} → ${Number(wethAfter)/1e18} (delta: ${Number(wethAfter - wethBefore)/1e18})`);
    console.log(`  Effective price: 1 WETH = ${Math.abs(Number(usdcBefore - usdcAfter) / Number(wethAfter - wethBefore) * 1e12).toFixed(2)} USDC`);
  } catch (e: any) {
    console.log(`  FAILED: ${e.shortMessage || e.message?.slice(0, 200)}`);
  }

  // Test reverse: WETH → USDC
  console.log('\n=== SWAP: 0.0001 WETH → USDC (12M gas) ===');
  try {
    const wethBefore2 = await pc.readContract({ address: WETH, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
    const usdcBefore2 = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;

    const hash = await wc.writeContract({
      address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn: WETH, tokenOut: USDC, deployer: ZERO, recipient: account.address, deadline,
        amountIn: 10n**14n, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
      gas: 12000000n, type: 'legacy' as any,
    } as any);
    const receipt = await pc.waitForTransactionReceipt({ hash });

    const wethAfter2 = await pc.readContract({ address: WETH, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
    const usdcAfter2 = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;

    console.log(`  Status: ${receipt.status}, gasUsed: ${receipt.gasUsed}`);
    console.log(`  WETH: ${Number(wethBefore2)/1e18} → ${Number(wethAfter2)/1e18} (delta: ${Number(wethAfter2 - wethBefore2)/1e18})`);
    console.log(`  USDC: ${Number(usdcBefore2)/1e6} → ${Number(usdcAfter2)/1e6} (delta: ${Number(usdcAfter2 - usdcBefore2)/1e6})`);
  } catch (e: any) {
    console.log(`  FAILED: ${e.shortMessage || e.message?.slice(0, 200)}`);
  }
}

main().catch(console.error);
