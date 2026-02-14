#!/usr/bin/env npx tsx
// Bootstrap v2: Create Algebra pools with CORRECT prices using fresh tokens
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

import { createWalletClient, createPublicClient, http, parseAbi, type Address, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const chain = { id: 103698795, name: 'BITE V2', nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' }, rpcUrls: { default: { http: [RPC] } } } as const;
const account = privateKeyToAccount(process.env.SERVER_PK as `0x${string}`);
const wc = createWalletClient({ account, chain: chain as any, transport: http(RPC) });
const pc = createPublicClient({ chain: chain as any, transport: http(RPC) });

// Token addresses — NEW tokens
const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const WETH = '0x40f7c49d1310ef5e1f2bd3a31bee123ac70cf518' as Address;
const WBTC = '0x63fcc83709a0af768675c1daaf5ec60832232aee' as Address;

// Algebra contracts
const FACTORY = '0x10253594A832f967994b44f33411940533302ACb' as Address;
const PM = '0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F' as Address;
const SR = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb' as Address;
const QUOTER = '0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;

const ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount) external',
  'function balanceOf(address account) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
]);

const FACTORY_ABI = parseAbi([
  'function poolByPair(address, address) external view returns (address)',
]);

const POOL_ABI = parseAbi([
  'function globalState() external view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)',
]);

const PM_INIT_ABI = parseAbi([
  'function createAndInitializePoolIfNecessary(address token0, address token1, address deployer, uint160 sqrtPriceX96, bytes data) external payable returns (address pool)',
]);

const PM_MINT_ABI = [{
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

function sortTokens(a: Address, b: Address): [Address, Address] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

// CORRECT sqrtPriceX96 calculation
// humanPrice = token1 per token0 (e.g., 2500 USDC per WETH)
// rawPrice = humanPrice * 10^(dec1 - dec0)
// sqrtPriceX96 = sqrt(rawPrice) * 2^96
function priceToSqrtPriceX96(humanPrice: number, dec0: number, dec1: number): bigint {
  const rawPrice = humanPrice * Math.pow(10, dec1 - dec0);
  const sqrtPrice = Math.sqrt(rawPrice);
  const Q96 = 2n ** 96n;

  // Use high precision: split into integer and fraction
  const result = BigInt(Math.round(sqrtPrice * Number(Q96)));
  console.log(`    humanPrice=${humanPrice}, dec0=${dec0}, dec1=${dec1}`);
  console.log(`    rawPrice=${rawPrice.toExponential(4)}, sqrtPrice=${sqrtPrice.toExponential(4)}`);
  console.log(`    sqrtPriceX96=${result}`);

  // Verify: (sqrtPriceX96 / 2^96)^2 * 10^(dec0 - dec1) should ≈ humanPrice
  const check = (Number(result) / Number(Q96)) ** 2 * Math.pow(10, dec0 - dec1);
  console.log(`    verify: ${check.toFixed(4)} (should be ~${humanPrice})`);

  return result;
}

async function sendTx(params: { address: Address; abi: any; functionName: string; args?: any[]; gas?: bigint }): Promise<Hash> {
  const hash = await wc.writeContract({
    address: params.address, abi: params.abi, functionName: params.functionName,
    args: params.args ?? [], gas: params.gas ?? 1000000n, type: 'legacy' as any,
  } as any);
  const receipt = await pc.waitForTransactionReceipt({ hash });
  if (receipt.status === 'reverted') throw new Error(`Reverted: ${hash}`);
  return hash;
}

async function main() {
  console.log('Server:', account.address);
  console.log('USDC:', USDC);
  console.log('WETH:', WETH);
  console.log('WBTC:', WBTC);

  // Step 1: Check balances
  console.log('\n=== BALANCES ===');
  const uBal = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const wBal = await pc.readContract({ address: WETH, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const bBal = await pc.readContract({ address: WBTC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  console.log(`  USDC: ${Number(uBal)/1e6}, WETH: ${Number(wBal)/1e18}, WBTC: ${Number(bBal)/1e8}`);

  // Step 2: Approve all tokens to PM and SR
  console.log('\n=== APPROVALS ===');
  const maxUint = 2n ** 256n - 1n;
  for (const [name, addr] of [['USDC', USDC], ['WETH', WETH], ['WBTC', WBTC]] as const) {
    for (const [spName, sp] of [['PM', PM], ['SR', SR]] as const) {
      console.log(`  ${name} → ${spName}...`);
      await sendTx({ address: addr, abi: ERC20_ABI, functionName: 'approve', args: [sp, maxUint], gas: 100000n });
    }
  }

  // Step 3: Create + Initialize Pools
  console.log('\n=== CREATE + INITIALIZE POOLS ===');

  // Pool definitions:
  // humanPrice = how many token1 per token0 (after sorting)
  const pools = [
    {
      name: 'USDC/WETH',
      tokenA: USDC, tokenB: WETH,
      decA: 6, decB: 18,
      // Human price: 1 WETH = 2500 USDC
      humanPriceAB: 2500,
    },
    {
      name: 'USDC/WBTC',
      tokenA: USDC, tokenB: WBTC,
      decA: 6, decB: 8,
      // Human price: 1 WBTC = 97000 USDC
      humanPriceAB: 97000,
    },
    {
      name: 'WETH/WBTC',
      tokenA: WETH, tokenB: WBTC,
      decA: 18, decB: 8,
      // Human price: 1 WBTC = 38.8 WETH (97000/2500)
      humanPriceAB: 38.8,
    },
  ];

  for (const pool of pools) {
    const [token0, token1] = sortTokens(pool.tokenA, pool.tokenB);
    const isSwapped = token0.toLowerCase() !== pool.tokenA.toLowerCase();
    const dec0 = isSwapped ? pool.decB : pool.decA;
    const dec1 = isSwapped ? pool.decA : pool.decB;

    // humanPriceAB = "tokenB per tokenA" (e.g., 2500 USDC per WETH)
    // After sorting: need "token1 per token0"
    // If swapped: token0=tokenB, token1=tokenA → price = tokenA per tokenB = 1/humanPriceAB
    // If not swapped: token0=tokenA, token1=tokenB → price = tokenB per tokenA = humanPriceAB
    const humanPrice = isSwapped ? (1 / pool.humanPriceAB) : pool.humanPriceAB;

    console.log(`\n  ${pool.name}: token0=${token0.slice(0,10)} (dec${dec0}), token1=${token1.slice(0,10)} (dec${dec1})`);
    console.log(`    swapped=${isSwapped}, humanPrice(t1/t0)=${humanPrice}`);

    const sqrtPrice = priceToSqrtPriceX96(humanPrice, dec0, dec1);

    // Check if pool exists
    const existing = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [token0, token1] }) as Address;
    if (existing !== ZERO) {
      console.log(`    Already exists: ${existing}`);
      // Read state
      const state = await pc.readContract({ address: existing, abi: POOL_ABI, functionName: 'globalState' }) as any;
      console.log(`    sqrtPriceX96=${state[0]}, tick=${state[1]}`);
      continue;
    }

    // Create + initialize
    try {
      const hash = await sendTx({
        address: PM, abi: PM_INIT_ABI,
        functionName: 'createAndInitializePoolIfNecessary',
        args: [token0, token1, ZERO, sqrtPrice, '0x'],
        gas: 10000000n,
      });
      console.log(`    Created! tx: ${hash.slice(0, 14)}...`);

      const poolAddr = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [token0, token1] }) as Address;
      console.log(`    Pool: ${poolAddr}`);

      const state = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'globalState' }) as any;
      console.log(`    sqrtPriceX96=${state[0]}, tick=${state[1]}`);
    } catch (err: any) {
      console.error(`    FAILED: ${err.message?.slice(0, 200)}`);
    }
  }

  // Step 4: Add Liquidity
  console.log('\n=== ADD LIQUIDITY ===');

  const liquidityConfigs = [
    {
      name: 'USDC/WETH',
      tokenA: USDC, tokenB: WETH,
      amountA: 2500n * 10n**6n,           // 2500 USDC
      amountB: 1n * 10n**18n,             // 1 WETH (~$2500)
    },
    {
      name: 'USDC/WBTC',
      tokenA: USDC, tokenB: WBTC,
      amountA: 5000n * 10n**6n,           // 5000 USDC
      amountB: 5154639n,                  // ~0.0515 WBTC (~$5000 at $97K)
    },
    {
      name: 'WETH/WBTC',
      tokenA: WETH, tokenB: WBTC,
      amountA: 2n * 10n**18n,             // 2 WETH (~$5000)
      amountB: 5154639n,                  // ~0.0515 WBTC (~$5000)
    },
  ];

  for (const liq of liquidityConfigs) {
    const [token0, token1] = sortTokens(liq.tokenA, liq.tokenB);
    const amount0 = token0.toLowerCase() === liq.tokenA.toLowerCase() ? liq.amountA : liq.amountB;
    const amount1 = token0.toLowerCase() === liq.tokenA.toLowerCase() ? liq.amountB : liq.amountA;

    const poolAddr = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [token0, token1] }) as Address;
    if (poolAddr === ZERO) {
      console.log(`  ${liq.name}: no pool, skipping`);
      continue;
    }

    console.log(`  ${liq.name}: adding ${amount0} token0, ${amount1} token1`);

    try {
      const hash = await sendTx({
        address: PM, abi: PM_MINT_ABI, functionName: 'mint',
        args: [{
          token0, token1, deployer: ZERO,
          tickLower: -887220, tickUpper: 887220,
          amount0Desired: amount0, amount1Desired: amount1,
          amount0Min: 0n, amount1Min: 0n,
          recipient: account.address,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
        }],
        gas: 5000000n,
      });
      console.log(`    Done! tx: ${hash.slice(0, 14)}...`);
    } catch (err: any) {
      console.error(`    FAILED: ${err.message?.slice(0, 300)}`);
    }
  }

  // Step 5: Verify with quotes
  console.log('\n=== VERIFICATION QUOTES ===');

  const quoteTests = [
    { name: '10 USDC → WETH', tIn: USDC, tOut: WETH, amt: 10n * 10n**6n },
    { name: '0.001 WETH → USDC', tIn: WETH, tOut: USDC, amt: 10n**15n },
    { name: '10 USDC → WBTC', tIn: USDC, tOut: WBTC, amt: 10n * 10n**6n },
    { name: '0.0001 WBTC → USDC', tIn: WBTC, tOut: USDC, amt: 10000n },
    { name: '0.01 WETH → WBTC', tIn: WETH, tOut: WBTC, amt: 10n**16n },
  ];

  for (const qt of quoteTests) {
    try {
      const r = await pc.readContract({
        address: QUOTER, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: qt.tIn, tokenOut: qt.tOut, deployer: ZERO, amountIn: qt.amt, limitSqrtPrice: 0n }],
      });
      const out = r[0] as bigint;
      // Format output based on token
      let formatted: string;
      if (qt.tOut === USDC) formatted = `${(Number(out) / 1e6).toFixed(6)} USDC`;
      else if (qt.tOut === WETH) formatted = `${(Number(out) / 1e18).toFixed(8)} WETH`;
      else formatted = `${(Number(out) / 1e8).toFixed(8)} WBTC`;
      console.log(`  ${qt.name} → ${formatted}`);
    } catch (e: any) {
      console.log(`  ${qt.name} → FAILED: ${e.message?.slice(0, 100)}`);
    }
  }

  // Step 6: Test actual swap
  console.log('\n=== TEST SWAP ===');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  console.log('  Swapping 1 USDC → WETH...');
  try {
    const hash = await wc.writeContract({
      address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn: USDC, tokenOut: WETH, deployer: ZERO, recipient: account.address, deadline, amountIn: 1000000n, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
      gas: 500000n, type: 'legacy' as any,
    } as any);
    const receipt = await pc.waitForTransactionReceipt({ hash });
    console.log(`  Status: ${receipt.status}, Logs: ${receipt.logs.length}`);
    if (receipt.status === 'success') {
      // Parse Transfer events for amounts
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      for (const log of receipt.logs) {
        if (log.topics[0] === transferTopic) {
          const from = '0x' + (log.topics[1] || '').slice(26);
          const to = '0x' + (log.topics[2] || '').slice(26);
          const amount = BigInt(log.data);
          const token = log.address.toLowerCase() === WETH.toLowerCase() ? 'WETH' : log.address.toLowerCase() === USDC.toLowerCase() ? 'USDC' : log.address.slice(0, 10);
          const dec = token === 'USDC' ? 6 : token === 'WETH' ? 18 : 8;
          console.log(`    Transfer: ${Number(amount) / Math.pow(10, dec)} ${token} (${from.slice(0, 8)} → ${to.slice(0, 8)})`);
        }
      }
      console.log('  SWAP WORKS!');
    } else {
      console.log('  Swap REVERTED');
    }
  } catch (e: any) {
    console.log(`  FAILED: ${e.shortMessage || e.message?.slice(0, 300)}`);
  }

  // Final balances
  console.log('\n=== FINAL BALANCES ===');
  const uFinal = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const wFinal = await pc.readContract({ address: WETH, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const bFinal = await pc.readContract({ address: WBTC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  console.log(`  USDC: ${Number(uFinal)/1e6}, WETH: ${Number(wFinal)/1e18}, WBTC: ${Number(bFinal)/1e8}`);

  // Summary
  console.log('\n=== POOL ADDRESSES ===');
  for (const [name, a, b] of [['USDC/WETH', USDC, WETH], ['USDC/WBTC', USDC, WBTC], ['WETH/WBTC', WETH, WBTC]] as const) {
    const [t0, t1] = sortTokens(a, b);
    const pool = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [t0, t1] }) as Address;
    console.log(`  ${name}: ${pool}`);
  }
}

main().catch(console.error);
