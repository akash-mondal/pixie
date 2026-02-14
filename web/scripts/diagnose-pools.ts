#!/usr/bin/env npx tsx
// Comprehensive pool diagnostics — check state, balances, allowances, quotes, swaps
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

import { createWalletClient, createPublicClient, http, type Address, parseAbi, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const chain = { id: 103698795, name: 'BITE V2', nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' }, rpcUrls: { default: { http: [RPC] } } } as const;
const account = privateKeyToAccount(process.env.SERVER_PK as `0x${string}`);
const pc = createPublicClient({ chain: chain as any, transport: http(RPC) });
const wc = createWalletClient({ account, chain: chain as any, transport: http(RPC) });

const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const WETH = '0x4c1928684b7028c2805fa1d12aced5c839a8d42c' as Address;
const WBTC = '0x0d5d9697bda657c1ba2d1882dcf7bb20903d3adc' as Address;
const SR = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb' as Address;
const QUOTER = '0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17' as Address;
const FACTORY = '0x10253594A832f967994b44f33411940533302ACb' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount)',
]);

const FACTORY_ABI = parseAbi([
  'function poolByPair(address, address) view returns (address)',
]);

const POOL_ABI = parseAbi([
  'function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]);

const QUOTER_ABI = [{
  name: 'quoteExactInputSingle', type: 'function' as const, stateMutability: 'nonpayable' as const,
  inputs: [{ name: 'params', type: 'tuple' as const, components: [
    { name: 'tokenIn', type: 'address' as const }, { name: 'tokenOut', type: 'address' as const },
    { name: 'deployer', type: 'address' as const }, { name: 'amountIn', type: 'uint256' as const },
    { name: 'limitSqrtPrice', type: 'uint160' as const },
  ]}],
  outputs: [{ name: 'amountOut', type: 'uint256' as const }, { name: 'fee', type: 'uint16' as const }],
}] as const;

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

function tokenName(addr: Address): string {
  const a = addr.toLowerCase();
  if (a === USDC.toLowerCase()) return 'USDC';
  if (a === WETH.toLowerCase()) return 'WETH';
  if (a === WBTC.toLowerCase()) return 'WBTC';
  return addr.slice(0, 10);
}

async function main() {
  console.log('Server:', account.address);

  // 1. Token balances
  console.log('\n=== TOKEN BALANCES ===');
  const usdcBal = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const wethBal = await pc.readContract({ address: WETH, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const wbtcBal = await pc.readContract({ address: WBTC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  console.log(`  USDC: ${Number(usdcBal) / 1e6}`);
  console.log(`  WETH: ${Number(wethBal) / 1e18}`);
  console.log(`  WBTC: ${Number(wbtcBal) / 1e8}`);

  // 2. Token allowances to SwapRouter
  console.log('\n=== ALLOWANCES TO SWAP ROUTER ===');
  for (const [name, token, dec] of [['USDC', USDC, 6], ['WETH', WETH, 18], ['WBTC', WBTC, 8]] as const) {
    const allow = await pc.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [account.address, SR] }) as bigint;
    console.log(`  ${name}: ${allow > 10n**50n ? 'MAX' : (Number(allow) / Math.pow(10, dec)).toString()}`);
  }

  // 3. Pool states
  console.log('\n=== POOL STATES ===');
  const pairs = [
    { name: 'USDC/WETH', a: USDC, b: WETH },
    { name: 'USDC/WBTC', a: USDC, b: WBTC },
    { name: 'WETH/WBTC', a: WETH, b: WBTC },
  ];

  for (const pair of pairs) {
    const poolAddr = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [pair.a, pair.b] }) as Address;
    if (poolAddr === ZERO) {
      console.log(`  ${pair.name}: NO POOL`);
      continue;
    }

    const state = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'globalState' }) as any;
    const liq = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'liquidity' }) as bigint;
    const t0 = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'token0' }) as Address;
    const t1 = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'token1' }) as Address;

    const sqrtP = BigInt(state[0]);
    const tick = Number(state[1]);
    const fee = Number(state[2]);
    const unlocked = Boolean(state[5]);

    // Calculate human price from sqrtPriceX96
    // price = (sqrtP / 2^96)^2, then adjust for decimals
    const sqrtPNum = Number(sqrtP) / Number(2n ** 96n);
    const rawPrice = sqrtPNum * sqrtPNum;

    console.log(`  ${pair.name}: pool=${poolAddr}`);
    console.log(`    token0=${tokenName(t0)} (${t0.slice(0,10)}), token1=${tokenName(t1)} (${t1.slice(0,10)})`);
    console.log(`    sqrtPriceX96=${sqrtP}, tick=${tick}, fee=${fee}bp, unlocked=${unlocked}`);
    console.log(`    liquidity=${liq}`);
    console.log(`    rawPrice(t1/t0)=${rawPrice.toExponential(4)}`);

    // Pool token balances
    const p0 = await pc.readContract({ address: t0, abi: ERC20_ABI, functionName: 'balanceOf', args: [poolAddr] }) as bigint;
    const p1 = await pc.readContract({ address: t1, abi: ERC20_ABI, functionName: 'balanceOf', args: [poolAddr] }) as bigint;
    console.log(`    pool ${tokenName(t0)} balance: ${p0}`);
    console.log(`    pool ${tokenName(t1)} balance: ${p1}`);
  }

  // 4. QuoterV2 quotes
  console.log('\n=== QUOTER V2 QUOTES ===');
  const quoteTests = [
    { name: '1 USDC → WETH', tokenIn: USDC, tokenOut: WETH, amountIn: 1000000n },
    { name: '0.001 WETH → USDC', tokenIn: WETH, tokenOut: USDC, amountIn: 10n**15n },
    { name: '0.00001 WETH → USDC', tokenIn: WETH, tokenOut: USDC, amountIn: 10n**13n },
    { name: '1 USDC → WBTC', tokenIn: USDC, tokenOut: WBTC, amountIn: 1000000n },
    { name: '0.0001 WBTC → USDC', tokenIn: WBTC, tokenOut: USDC, amountIn: 10000n },
  ];

  for (const qt of quoteTests) {
    try {
      const r = await pc.readContract({
        address: QUOTER, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: qt.tokenIn, tokenOut: qt.tokenOut, deployer: ZERO, amountIn: qt.amountIn, limitSqrtPrice: 0n }],
      });
      const out = r[0] as bigint;
      console.log(`  ${qt.name} → ${out} (fee=${r[1]})`);
    } catch (e: any) {
      console.log(`  ${qt.name} → FAILED: ${e.message?.slice(0, 100)}`);
    }
  }

  // 5. Try swap via SwapRouter with VERY small amount
  console.log('\n=== SWAP ATTEMPT (tiny amount) ===');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Try selling 0.0000001 WETH for USDC (100000000000 wei = 10^11)
  const tinyAmount = 100000000000n; // 10^11 wei = 0.0000001 WETH
  console.log(`  Selling ${Number(tinyAmount)/1e18} WETH for USDC...`);
  try {
    const hash = await wc.writeContract({
      address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn: WETH, tokenOut: USDC, deployer: ZERO, recipient: account.address, deadline, amountIn: tinyAmount, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
      gas: 1000000n, type: 'legacy' as any,
    } as any);
    const receipt = await pc.waitForTransactionReceipt({ hash });
    console.log(`  Status: ${receipt.status}, Logs: ${receipt.logs.length}`);
    for (const log of receipt.logs.slice(0, 5)) {
      console.log(`    ${tokenName(log.address as Address)}: topic0=${log.topics[0]?.slice(0, 10)} data=${log.data?.slice(0, 40)}`);
    }
  } catch (e: any) {
    console.log(`  FAILED: ${e.shortMessage || e.message?.slice(0, 300)}`);
  }

  // Try selling 1 USDC for WETH
  console.log(`\n  Selling 1 USDC for WETH...`);
  try {
    const hash = await wc.writeContract({
      address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn: USDC, tokenOut: WETH, deployer: ZERO, recipient: account.address, deadline, amountIn: 1000000n, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
      gas: 1000000n, type: 'legacy' as any,
    } as any);
    const receipt = await pc.waitForTransactionReceipt({ hash });
    console.log(`  Status: ${receipt.status}, Logs: ${receipt.logs.length}`);
    for (const log of receipt.logs.slice(0, 5)) {
      console.log(`    ${tokenName(log.address as Address)}: topic0=${log.topics[0]?.slice(0, 10)} data=${log.data?.slice(0, 40)}`);
    }
  } catch (e: any) {
    console.log(`  FAILED: ${e.shortMessage || e.message?.slice(0, 300)}`);
  }

  // 6. Test creating a pool with deployer = server address (to make new clean pool)
  console.log('\n=== CHECK: Can we create pools with deployer? ===');
  // Check if pool exists for USDC/WETH with deployer=server
  // Algebra v1.2.2: customPool(token0, token1, deployer) — not poolByPair
  // Let's check factory for customPool function
  try {
    const customPoolAbi = parseAbi(['function customPool(address, address, address) view returns (address)']);
    const pool = await pc.readContract({
      address: FACTORY, abi: customPoolAbi, functionName: 'customPool',
      args: [WETH, USDC, account.address],
    }) as Address;
    console.log(`  USDC/WETH with deployer=${account.address.slice(0, 10)}: ${pool === ZERO ? 'NOT EXISTS (can create!)' : pool}`);
  } catch (e: any) {
    console.log(`  customPool check failed: ${e.message?.slice(0, 150)}`);
    console.log('  (Factory may not support custom deployer pools)');
  }
}

main().catch(console.error);
