#!/usr/bin/env npx tsx
// Add remaining liquidity to USDC/WBTC and WETH/WBTC pools
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

import { createWalletClient, createPublicClient, http, parseAbi, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const chain = { id: 103698795, name: 'BITE V2', nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' }, rpcUrls: { default: { http: [RPC] } } } as const;
const account = privateKeyToAccount(process.env.SERVER_PK as `0x${string}`);
const wc = createWalletClient({ account, chain: chain as any, transport: http(RPC) });
const pc = createPublicClient({ chain: chain as any, transport: http(RPC) });

const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const WETH = '0xd74190a1b2a69c2f123a0df16ba21959a01eb843' as Address;
const WBTC = '0x26b1f043545118103097767184c419f12b5a3e88' as Address;
const PM = '0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F' as Address;
const SR = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb' as Address;
const QUOTER = '0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17' as Address;
const FACTORY = '0x10253594A832f967994b44f33411940533302ACb' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const FACTORY_ABI = parseAbi(['function poolByPair(address, address) view returns (address)']);
const POOL_ABI = parseAbi([
  'function globalState() view returns (uint160, int24, uint16, uint8, uint16, bool)',
  'function liquidity() view returns (uint128)',
]);

const PM_MINT_ABI = [{
  name: 'mint', type: 'function' as const, stateMutability: 'payable' as const,
  inputs: [{ name: 'params', type: 'tuple' as const, components: [
    { name: 'token0', type: 'address' as const }, { name: 'token1', type: 'address' as const },
    { name: 'deployer', type: 'address' as const }, { name: 'tickLower', type: 'int24' as const },
    { name: 'tickUpper', type: 'int24' as const }, { name: 'amount0Desired', type: 'uint256' as const },
    { name: 'amount1Desired', type: 'uint256' as const }, { name: 'amount0Min', type: 'uint256' as const },
    { name: 'amount1Min', type: 'uint256' as const }, { name: 'recipient', type: 'address' as const },
    { name: 'deadline', type: 'uint256' as const },
  ]}],
  outputs: [
    { name: 'tokenId', type: 'uint256' as const }, { name: 'liquidity', type: 'uint128' as const },
    { name: 'amount0', type: 'uint256' as const }, { name: 'amount1', type: 'uint256' as const },
  ],
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

const QUOTER_ABI = [{
  name: 'quoteExactInputSingle', type: 'function' as const, stateMutability: 'nonpayable' as const,
  inputs: [{ name: 'params', type: 'tuple' as const, components: [
    { name: 'tokenIn', type: 'address' as const }, { name: 'tokenOut', type: 'address' as const },
    { name: 'deployer', type: 'address' as const }, { name: 'amountIn', type: 'uint256' as const },
    { name: 'limitSqrtPrice', type: 'uint160' as const },
  ]}],
  outputs: [{ name: 'amountOut', type: 'uint256' as const }, { name: 'fee', type: 'uint16' as const }],
}] as const;

function sortTokens(a: Address, b: Address): [Address, Address] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

async function main() {
  console.log('Server:', account.address);

  // Check balances
  const ub = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const wb = await pc.readContract({ address: WETH, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const bb = await pc.readContract({ address: WBTC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  console.log(`Balances: ${Number(ub)/1e6} USDC, ${Number(wb)/1e18} WETH, ${Number(bb)/1e8} WBTC`);

  // Check pool states
  console.log('\n=== POOL STATES ===');
  for (const [name, a, b] of [['USDC/WETH', USDC, WETH], ['USDC/WBTC', USDC, WBTC], ['WETH/WBTC', WETH, WBTC]] as const) {
    const [t0, t1] = sortTokens(a, b);
    const pool = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [t0, t1] }) as Address;
    if (pool === ZERO) { console.log(`  ${name}: NO POOL`); continue; }
    const state = await pc.readContract({ address: pool, abi: POOL_ABI, functionName: 'globalState' }) as any;
    const liq = await pc.readContract({ address: pool, abi: POOL_ABI, functionName: 'liquidity' }) as bigint;
    console.log(`  ${name}: pool=${pool.slice(0,14)}, tick=${Number(state[1])}, liq=${liq}`);
  }

  // Re-ensure approvals
  console.log('\n=== RE-APPROVE ===');
  const max = 2n ** 256n - 1n;
  for (const addr of [USDC, WETH, WBTC]) {
    for (const sp of [PM, SR]) {
      const hash = await wc.writeContract({
        address: addr, abi: ERC20_ABI, functionName: 'approve', args: [sp, max],
        gas: 100000n, type: 'legacy' as any,
      } as any);
      await pc.waitForTransactionReceipt({ hash });
    }
  }
  console.log('  Done');

  // Try adding liquidity with very high gas
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const liqConfigs = [
    { name: 'USDC/WBTC', tokenA: USDC, tokenB: WBTC, amountA: 5000n * 10n**6n, amountB: 5154639n },
    { name: 'WETH/WBTC', tokenA: WETH, tokenB: WBTC, amountA: 2n * 10n**18n, amountB: 5154639n },
  ];

  for (const liq of liqConfigs) {
    const [token0, token1] = sortTokens(liq.tokenA, liq.tokenB);
    const amount0 = token0.toLowerCase() === liq.tokenA.toLowerCase() ? liq.amountA : liq.amountB;
    const amount1 = token0.toLowerCase() === liq.tokenA.toLowerCase() ? liq.amountB : liq.amountA;

    const pool = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [token0, token1] }) as Address;
    console.log(`\n  ${liq.name}: pool=${pool.slice(0,14)}`);
    console.log(`    token0=${token0.slice(0,10)}, token1=${token1.slice(0,10)}`);
    console.log(`    amount0=${amount0}, amount1=${amount1}`);

    // Try with 20M gas
    try {
      const hash = await wc.writeContract({
        address: PM, abi: PM_MINT_ABI, functionName: 'mint',
        args: [{
          token0, token1, deployer: ZERO, tickLower: -887220, tickUpper: 887220,
          amount0Desired: amount0, amount1Desired: amount1, amount0Min: 0n, amount1Min: 0n,
          recipient: account.address, deadline,
        }],
        gas: 20000000n, type: 'legacy' as any,
      } as any);
      const receipt = await pc.waitForTransactionReceipt({ hash });
      console.log(`    Status: ${receipt.status}, gasUsed: ${receipt.gasUsed}`);
      if (receipt.status === 'reverted') {
        console.log('    REVERTED - trying with smaller amounts...');
        // Try with much smaller amounts
        const smallAmount0 = amount0 / 10n;
        const smallAmount1 = amount1 / 10n;
        const hash2 = await wc.writeContract({
          address: PM, abi: PM_MINT_ABI, functionName: 'mint',
          args: [{
            token0, token1, deployer: ZERO, tickLower: -887220, tickUpper: 887220,
            amount0Desired: smallAmount0, amount1Desired: smallAmount1, amount0Min: 0n, amount1Min: 0n,
            recipient: account.address, deadline,
          }],
          gas: 20000000n, type: 'legacy' as any,
        } as any);
        const receipt2 = await pc.waitForTransactionReceipt({ hash: hash2 });
        console.log(`    Retry: ${receipt2.status}, gasUsed: ${receipt2.gasUsed}`);
      }
    } catch (e: any) {
      console.log(`    Error: ${e.message?.slice(0, 200)}`);
    }
  }

  // Verify quotes
  console.log('\n=== FINAL QUOTES ===');
  const quoteTests = [
    { name: '1 USDC → WETH', tIn: USDC, tOut: WETH, amt: 1000000n, decOut: 18, sym: 'WETH' },
    { name: '0.001 WETH → USDC', tIn: WETH, tOut: USDC, amt: 10n**15n, decOut: 6, sym: 'USDC' },
    { name: '1 USDC → WBTC', tIn: USDC, tOut: WBTC, amt: 1000000n, decOut: 8, sym: 'WBTC' },
    { name: '0.001 WBTC → USDC', tIn: WBTC, tOut: USDC, amt: 100000n, decOut: 6, sym: 'USDC' },
    { name: '0.01 WETH → WBTC', tIn: WETH, tOut: WBTC, amt: 10n**16n, decOut: 8, sym: 'WBTC' },
  ];

  for (const qt of quoteTests) {
    try {
      const r = await pc.readContract({
        address: QUOTER, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: qt.tIn, tokenOut: qt.tOut, deployer: ZERO, amountIn: qt.amt, limitSqrtPrice: 0n }],
      });
      console.log(`  ${qt.name} → ${(Number(r[0]) / Math.pow(10, qt.decOut)).toFixed(8)} ${qt.sym}`);
    } catch (e: any) {
      console.log(`  ${qt.name} → FAILED`);
    }
  }

  // Test swap
  console.log('\n=== TEST SWAPS (12M gas) ===');

  console.log('  1 USDC → WETH...');
  try {
    const hash = await wc.writeContract({
      address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn: USDC, tokenOut: WETH, deployer: ZERO, recipient: account.address, deadline,
        amountIn: 1000000n, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
      gas: 12000000n, type: 'legacy' as any,
    } as any);
    const receipt = await pc.waitForTransactionReceipt({ hash });
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    for (const log of receipt.logs) {
      if (log.topics[0] === transferTopic && log.address.toLowerCase() === WETH.toLowerCase()) {
        const to = '0x' + (log.topics[2] || '').slice(26);
        if (to.toLowerCase() === account.address.toLowerCase()) {
          const amt = BigInt(log.data);
          console.log(`    Got ${Number(amt)/1e18} WETH (effective: 1 WETH = ${1e18/Number(amt)} USDC)`);
        }
      }
    }
    console.log(`    ${receipt.status}, gas: ${receipt.gasUsed}`);
  } catch (e: any) {
    console.log(`    FAILED: ${e.message?.slice(0, 100)}`);
  }

  console.log('  0.001 WETH → USDC...');
  try {
    const hash = await wc.writeContract({
      address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn: WETH, tokenOut: USDC, deployer: ZERO, recipient: account.address, deadline,
        amountIn: 10n**15n, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
      gas: 12000000n, type: 'legacy' as any,
    } as any);
    const receipt = await pc.waitForTransactionReceipt({ hash });
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    for (const log of receipt.logs) {
      if (log.topics[0] === transferTopic && log.address.toLowerCase() === USDC.toLowerCase()) {
        const to = '0x' + (log.topics[2] || '').slice(26);
        if (to.toLowerCase() === account.address.toLowerCase()) {
          const amt = BigInt(log.data);
          console.log(`    Got ${Number(amt)/1e6} USDC (effective: 1 WETH = ${Number(amt)/1e6/0.001} USDC)`);
        }
      }
    }
    console.log(`    ${receipt.status}, gas: ${receipt.gasUsed}`);
  } catch (e: any) {
    console.log(`    FAILED: ${e.message?.slice(0, 100)}`);
  }
}

main().catch(console.error);
