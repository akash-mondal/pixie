#!/usr/bin/env npx tsx
// Fix pool prices by doing directional swaps + adding fresh liquidity
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

import { createWalletClient, createPublicClient, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const WETH = '0x4c1928684b7028c2805fa1d12aced5c839a8d42c' as Address;
const WBTC = '0x0d5d9697bda657c1ba2d1882dcf7bb20903d3adc' as Address;
const SR = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb' as Address;
const QUOTER = '0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const PM = '0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F' as Address;
const FACTORY = '0x10253594A832f967994b44f33411940533302ACb' as Address;

const chain = {
  id: 103698795, name: 'BITE V2 Sandbox 2',
  nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const account = privateKeyToAccount(process.env.SERVER_PK as `0x${string}`);
const wc = createWalletClient({ account, chain: chain as any, transport: http(RPC) });
const pc = createPublicClient({ chain: chain as any, transport: http(RPC) });

const SWAP_ABI = [{
  name: 'exactInputSingle', type: 'function' as const, stateMutability: 'payable' as const,
  inputs: [{ name: 'params', type: 'tuple' as const, components: [
    { name: 'tokenIn', type: 'address' as const },
    { name: 'tokenOut', type: 'address' as const },
    { name: 'deployer', type: 'address' as const },
    { name: 'recipient', type: 'address' as const },
    { name: 'deadline', type: 'uint256' as const },
    { name: 'amountIn', type: 'uint256' as const },
    { name: 'amountOutMinimum', type: 'uint256' as const },
    { name: 'limitSqrtPrice', type: 'uint160' as const },
  ]}],
  outputs: [{ name: 'amountOut', type: 'uint256' as const }],
}] as const;

const QUOTER_ABI = [{
  name: 'quoteExactInputSingle', type: 'function' as const, stateMutability: 'nonpayable' as const,
  inputs: [{ name: 'params', type: 'tuple' as const, components: [
    { name: 'tokenIn', type: 'address' as const },
    { name: 'tokenOut', type: 'address' as const },
    { name: 'deployer', type: 'address' as const },
    { name: 'amountIn', type: 'uint256' as const },
    { name: 'limitSqrtPrice', type: 'uint160' as const },
  ]}],
  outputs: [{ name: 'amountOut', type: 'uint256' as const }, { name: 'fee', type: 'uint16' as const }],
}] as const;

const ERC20 = [{
  name: 'balanceOf', type: 'function' as const, stateMutability: 'view' as const,
  inputs: [{ name: 'a', type: 'address' as const }],
  outputs: [{ name: '', type: 'uint256' as const }],
}] as const;

const POOL_ABI = [{
  name: 'globalState', type: 'function' as const, stateMutability: 'view' as const,
  inputs: [],
  outputs: [
    { name: 'price', type: 'uint160' as const },
    { name: 'tick', type: 'int24' as const },
    { name: 'fee', type: 'uint16' as const },
    { name: 'pluginConfig', type: 'uint8' as const },
    { name: 'communityFee', type: 'uint16' as const },
    { name: 'unlocked', type: 'bool' as const },
  ],
}] as const;

const FACTORY_ABI = [{
  name: 'poolByPair', type: 'function' as const, stateMutability: 'view' as const,
  inputs: [{ name: 'a', type: 'address' as const }, { name: 'b', type: 'address' as const }],
  outputs: [{ name: '', type: 'address' as const }],
}] as const;

const NFT_PM_ABI = [{
  name: 'mint', type: 'function' as const, stateMutability: 'payable' as const,
  inputs: [{ name: 'params', type: 'tuple' as const, components: [
    { name: 'token0', type: 'address' as const },
    { name: 'token1', type: 'address' as const },
    { name: 'deployer', type: 'address' as const },
    { name: 'tickLower', type: 'int24' as const },
    { name: 'tickUpper', type: 'int24' as const },
    { name: 'amount0Desired', type: 'uint256' as const },
    { name: 'amount1Desired', type: 'uint256' as const },
    { name: 'amount0Min', type: 'uint256' as const },
    { name: 'amount1Min', type: 'uint256' as const },
    { name: 'recipient', type: 'address' as const },
    { name: 'deadline', type: 'uint256' as const },
  ]}],
  outputs: [
    { name: 'tokenId', type: 'uint256' as const },
    { name: 'liquidity', type: 'uint128' as const },
    { name: 'amount0', type: 'uint256' as const },
    { name: 'amount1', type: 'uint256' as const },
  ],
}] as const;

function sortTokens(a: Address, b: Address): [Address, Address] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

async function swap(tokenIn: Address, tokenOut: Address, amountIn: bigint) {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const hash = await wc.writeContract({
    address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
    args: [{ tokenIn, tokenOut, deployer: ZERO, recipient: account.address, deadline, amountIn, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
    gas: 500000n, type: 'legacy' as any,
  } as any);
  const r = await pc.waitForTransactionReceipt({ hash });
  return { hash, status: r.status };
}

async function quote(tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<bigint> {
  try {
    const r = await pc.readContract({
      address: QUOTER, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle',
      args: [{ tokenIn, tokenOut, deployer: ZERO, amountIn, limitSqrtPrice: 0n }],
    });
    return r[0] as bigint;
  } catch { return 0n; }
}

async function addLiquidity(tokenA: Address, tokenB: Address, amount0: bigint, amount1: bigint) {
  const [t0, t1] = sortTokens(tokenA, tokenB);
  const a0 = t0.toLowerCase() === tokenA.toLowerCase() ? amount0 : amount1;
  const a1 = t0.toLowerCase() === tokenA.toLowerCase() ? amount1 : amount0;
  const hash = await wc.writeContract({
    address: PM, abi: NFT_PM_ABI, functionName: 'mint',
    args: [{ token0: t0, token1: t1, deployer: ZERO, tickLower: -887220, tickUpper: 887220,
      amount0Desired: a0, amount1Desired: a1, amount0Min: 0n, amount1Min: 0n,
      recipient: account.address, deadline: BigInt(Math.floor(Date.now() / 1000) + 3600) }],
    gas: 5000000n, type: 'legacy' as any,
  } as any);
  const r = await pc.waitForTransactionReceipt({ hash });
  return { hash, status: r.status };
}

async function poolPrice(tokenA: Address, tokenB: Address): Promise<string> {
  const [t0, t1] = sortTokens(tokenA, tokenB);
  const poolAddr = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [t0, t1] }) as Address;
  if (poolAddr === ZERO) return 'NO POOL';
  const state = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'globalState' }) as any;
  const sqrtP = BigInt(state[0]);
  const tick = Number(state[1]);
  return `sqrtP=${sqrtP}, tick=${tick}`;
}

async function main() {
  console.log('Server:', account.address);

  // Check current pool states
  console.log('\n=== Current Pool States ===');
  console.log('USDC/WETH:', await poolPrice(USDC, WETH));
  console.log('USDC/WBTC:', await poolPrice(USDC, WBTC));
  console.log('WETH/WBTC:', await poolPrice(WETH, WBTC));

  // Current quotes
  console.log('\n=== Current Quotes ===');
  let q: bigint;
  q = await quote(USDC, WETH, 500000n); console.log('0.50 USDC → WETH:', Number(q) / 1e18);
  q = await quote(WETH, USDC, 10n**14n); console.log('0.0001 WETH → USDC:', Number(q) / 1e6);
  q = await quote(USDC, WBTC, 250000n); console.log('0.25 USDC → WBTC:', Number(q) / 1e8);
  q = await quote(WBTC, USDC, 100n); console.log('0.000001 WBTC → USDC:', Number(q) / 1e6);

  // Fix USDC/WETH: The current price has WETH way overpriced.
  // Need to sell WETH for USDC to push price down.
  console.log('\n=== Fixing USDC/WETH Pool ===');

  // Target: 1 WETH ≈ 2500 USDC.
  // Sell large amount of WETH to drain USDC side and crash WETH price
  for (let i = 0; i < 3; i++) {
    try {
      const r = await swap(WETH, USDC, 20n * 10n**18n);
      console.log(`  Swap ${i+1}: 20 WETH → USDC — ${r.status} ${r.hash.slice(0,14)}`);
    } catch (e: any) {
      console.log(`  Swap ${i+1} failed:`, e.message?.slice(0, 100));
      break;
    }
    q = await quote(USDC, WETH, 500000n);
    console.log(`  After: 0.50 USDC → ${Number(q) / 1e18} WETH`);
    if (q > 0n) break;
  }

  // Now add large USDC + WETH liquidity to establish ~$2500 price
  console.log('\n  Adding liquidity near correct price...');
  try {
    const r = await addLiquidity(USDC, WETH, 5000n * 10n**6n, 2n * 10n**18n);
    console.log('  Added 5000 USDC + 2 WETH:', r.status, r.hash.slice(0, 14));
  } catch (e: any) {
    console.log('  Liquidity failed:', e.message?.slice(0, 150));
  }

  // Fix USDC/WBTC: WBTC is way too cheap. Sell WBTC to push price up.
  console.log('\n=== Fixing USDC/WBTC Pool ===');
  for (let i = 0; i < 2; i++) {
    try {
      const r = await swap(WBTC, USDC, 3n * 10n**8n);
      console.log(`  Swap ${i+1}: 3 WBTC → USDC — ${r.status} ${r.hash.slice(0,14)}`);
    } catch (e: any) {
      console.log(`  Swap ${i+1} failed:`, e.message?.slice(0, 100));
      break;
    }
  }
  // Add liquidity
  try {
    const r = await addLiquidity(USDC, WBTC, 5000n * 10n**6n, 5n * 10n**6n); // 5000 USDC + 0.05 WBTC
    console.log('  Added 5000 USDC + 0.05 WBTC:', r.status, r.hash.slice(0, 14));
  } catch (e: any) {
    console.log('  Liquidity failed:', e.message?.slice(0, 150));
  }

  // Fix WETH/WBTC
  console.log('\n=== Fixing WETH/WBTC Pool ===');
  try {
    const r = await swap(WBTC, WETH, 2n * 10n**8n);
    console.log('  Swap: 2 WBTC → WETH —', r.status, r.hash.slice(0, 14));
  } catch (e: any) {
    console.log('  Swap failed:', e.message?.slice(0, 100));
  }
  try {
    const r = await addLiquidity(WETH, WBTC, 2n * 10n**18n, 5n * 10n**6n); // 2 WETH + 0.05 WBTC
    console.log('  Added 2 WETH + 0.05 WBTC:', r.status, r.hash.slice(0, 14));
  } catch (e: any) {
    console.log('  Liquidity failed:', e.message?.slice(0, 150));
  }

  // Final quotes
  console.log('\n=== Final Quotes ===');
  q = await quote(USDC, WETH, 500000n); console.log('0.50 USDC → WETH:', Number(q) / 1e18);
  q = await quote(WETH, USDC, 10n**14n); console.log('0.0001 WETH → USDC:', Number(q) / 1e6);
  q = await quote(USDC, WBTC, 250000n); console.log('0.25 USDC → WBTC:', Number(q) / 1e8);
  q = await quote(WBTC, USDC, 10000n); console.log('0.0001 WBTC → USDC:', Number(q) / 1e6);
  q = await quote(WETH, WBTC, 10n**16n); console.log('0.01 WETH → WBTC:', Number(q) / 1e8);

  console.log('\n=== Pool States ===');
  console.log('USDC/WETH:', await poolPrice(USDC, WETH));
  console.log('USDC/WBTC:', await poolPrice(USDC, WBTC));
  console.log('WETH/WBTC:', await poolPrice(WETH, WBTC));

  // Balances
  const ub = await pc.readContract({ address: USDC, abi: ERC20, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const wb = await pc.readContract({ address: WETH, abi: ERC20, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const bb = await pc.readContract({ address: WBTC, abi: ERC20, functionName: 'balanceOf', args: [account.address] }) as bigint;
  console.log(`\nFinal: ${Number(ub)/1e6} USDC, ${Number(wb)/1e18} WETH, ${Number(bb)/1e8} WBTC`);
}

main().catch(console.error);
