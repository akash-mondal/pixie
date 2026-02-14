#!/usr/bin/env npx tsx
// Bootstrap Algebra Finance Integral v1.2.2 pools on BITE V2 Sandbox 2
// Run once: npx tsx scripts/bootstrap-pools.ts
//
// Uses createAndInitializePoolIfNecessary on NonfungiblePositionManager
// (PoolInitializer base) — creates pool + initializes price in one call.
// Then adds full-range liquidity via mint with deployer field.

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually (no dotenv dependency)
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

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  type Address,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// --- Config ---
const RPC_URL = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const CHAIN_ID = 103698795;

const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const WETH = '0x4c1928684b7028c2805fa1d12aced5c839a8d42c' as Address;
const WBTC = '0x0d5d9697bda657c1ba2d1882dcf7bb20903d3adc' as Address;

const FACTORY = '0x10253594A832f967994b44f33411940533302ACb' as Address;
const POSITION_MANAGER = '0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F' as Address;
const SWAP_ROUTER = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb' as Address;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address;

// --- ABIs (Algebra Integral v1.2.2 — all structs include `deployer` field) ---
const MINTABLE_ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount) external',
  'function balanceOf(address account) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
]);

const FACTORY_ABI = parseAbi([
  'function createPool(address tokenA, address tokenB, bytes data) external returns (address pool)',
  'function poolByPair(address tokenA, address tokenB) external view returns (address pool)',
]);

const POOL_ABI = parseAbi([
  'function initialize(uint160 initialPrice) external',
  'function globalState() external view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)',
]);

// PoolInitializer (inherited by NonfungiblePositionManager)
const POOL_INITIALIZER_ABI = parseAbi([
  'function createAndInitializePoolIfNecessary(address token0, address token1, address deployer, uint160 sqrtPriceX96, bytes data) external payable returns (address pool)',
]);

// NonfungiblePositionManager — MintParams has `deployer` field in v1.2.2
const NFT_PM_ABI = [
  {
    name: 'mint',
    type: 'function' as const,
    stateMutability: 'payable' as const,
    inputs: [{
      name: 'params',
      type: 'tuple' as const,
      components: [
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
      ],
    }],
    outputs: [
      { name: 'tokenId', type: 'uint256' as const },
      { name: 'liquidity', type: 'uint128' as const },
      { name: 'amount0', type: 'uint256' as const },
      { name: 'amount1', type: 'uint256' as const },
    ],
  },
] as const;

// --- Setup ---
const pk = process.env.SERVER_PK;
if (!pk) throw new Error('SERVER_PK not set in .env.local');

const account = privateKeyToAccount(pk as `0x${string}`);
console.log('Server wallet:', account.address);

const chain = {
  id: CHAIN_ID,
  name: 'BITE V2 Sandbox 2',
  nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

const walletClient = createWalletClient({
  account,
  chain: chain as any,
  transport: http(RPC_URL),
});

const publicClient = createPublicClient({
  chain: chain as any,
  transport: http(RPC_URL),
});

async function sendTx(params: { address: Address; abi: any; functionName: string; args?: any[]; value?: bigint; gas?: bigint }): Promise<Hash> {
  const hash = await walletClient.writeContract({
    address: params.address,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args ?? [],
    value: params.value ?? 0n,
    gas: params.gas ?? 1000000n,
    type: 'legacy' as any,
  } as any);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === 'reverted') {
    throw new Error(`Transaction reverted: ${hash}`);
  }
  return hash;
}

// Sort tokens by address (Algebra requires token0 < token1)
function sortTokens(a: Address, b: Address): [Address, Address] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

// Calculate sqrtPriceX96: price is token1/token0 adjusted for decimals
// sqrtPriceX96 = sqrt(price * 10^(decimals0 - decimals1)) * 2^96
function priceToSqrtPriceX96(price: number, decimals0: number, decimals1: number): bigint {
  const adjustedPrice = price * Math.pow(10, decimals0 - decimals1);
  const sqrtPrice = Math.sqrt(adjustedPrice);
  const Q96 = 2n ** 96n;
  return BigInt(Math.round(sqrtPrice * Number(Q96)));
}

// --- Main ---
async function main() {
  console.log('\n=== STEP 1: Mint tokens ===');

  const wethBal = await publicClient.readContract({ address: WETH, abi: MINTABLE_ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const wbtcBal = await publicClient.readContract({ address: WBTC, abi: MINTABLE_ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const usdcBal = await publicClient.readContract({ address: USDC, abi: MINTABLE_ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  console.log(`  Balances: ${Number(usdcBal) / 1e6} USDC, ${Number(wethBal) / 1e18} WETH, ${Number(wbtcBal) / 1e8} WBTC`);

  if (wethBal < 10n * 10n ** 18n) {
    console.log('  Minting 100 WETH...');
    await sendTx({ address: WETH, abi: MINTABLE_ERC20_ABI, functionName: 'mint', args: [account.address, 100n * 10n ** 18n] });
    console.log('    Done');
  }

  if (wbtcBal < 1n * 10n ** 8n) {
    console.log('  Minting 10 WBTC...');
    await sendTx({ address: WBTC, abi: MINTABLE_ERC20_ABI, functionName: 'mint', args: [account.address, 10n * 10n ** 8n] });
    console.log('    Done');
  }

  console.log('\n=== STEP 2: Approve tokens ===');
  const maxUint = 2n ** 256n - 1n;

  for (const [name, addr] of [['USDC', USDC], ['WETH', WETH], ['WBTC', WBTC]] as const) {
    for (const [spenderName, spender] of [['PositionManager', POSITION_MANAGER], ['SwapRouter', SWAP_ROUTER]] as const) {
      console.log(`  ${name} → ${spenderName}...`);
      await sendTx({ address: addr, abi: MINTABLE_ERC20_ABI, functionName: 'approve', args: [spender, maxUint], gas: 100000n });
    }
  }

  console.log('\n=== STEP 3: Create + initialize pools via PositionManager ===');

  // Pool configs: price is token1/token0 (after sorting by address)
  const pools = [
    { name: 'USDC/WETH', tokenA: USDC, tokenB: WETH, price: 2500, decA: 6, decB: 18 },
    { name: 'USDC/WBTC', tokenA: USDC, tokenB: WBTC, price: 97000, decA: 6, decB: 8 },
    { name: 'WETH/WBTC', tokenA: WETH, tokenB: WBTC, price: 38.8, decA: 18, decB: 8 },
  ];

  for (const pool of pools) {
    const [token0, token1] = sortTokens(pool.tokenA, pool.tokenB);
    const dec0 = token0.toLowerCase() === pool.tokenA.toLowerCase() ? pool.decA : pool.decB;
    const dec1 = token0.toLowerCase() === pool.tokenA.toLowerCase() ? pool.decB : pool.decA;

    // Price for pool is token1/token0 — if we sorted, we may need to invert
    const priceForPool = token0.toLowerCase() === pool.tokenA.toLowerCase()
      ? pool.price
      : 1 / pool.price;
    const sqrtPrice = priceToSqrtPriceX96(priceForPool, dec0, dec1);

    console.log(`  ${pool.name}: token0=${token0.slice(0, 10)}, token1=${token1.slice(0, 10)}`);
    console.log(`    sqrtPriceX96 = ${sqrtPrice}`);

    // Check if pool exists
    const existingPool = await publicClient.readContract({
      address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [token0, token1],
    }) as Address;

    if (existingPool !== ZERO_ADDR) {
      console.log(`    Pool already exists: ${existingPool}`);
      continue;
    }

    // Create + initialize via PositionManager.createAndInitializePoolIfNecessary
    try {
      const hash = await sendTx({
        address: POSITION_MANAGER,
        abi: POOL_INITIALIZER_ABI,
        functionName: 'createAndInitializePoolIfNecessary',
        args: [token0, token1, ZERO_ADDR, sqrtPrice, '0x'],
        gas: 10000000n,
      });
      console.log(`    Created + initialized! tx: ${hash.slice(0, 14)}...`);

      // Verify
      const poolAddr = await publicClient.readContract({
        address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [token0, token1],
      }) as Address;
      console.log(`    Pool address: ${poolAddr}`);
    } catch (err: any) {
      console.error(`    Failed: ${err.message?.slice(0, 200)}`);

      // Fallback: try factory.createPool directly
      console.log('    Trying factory.createPool fallback...');
      try {
        await sendTx({
          address: FACTORY, abi: FACTORY_ABI, functionName: 'createPool',
          args: [token0, token1, '0x'], gas: 10000000n,
        });
        const poolAddr = await publicClient.readContract({
          address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [token0, token1],
        }) as Address;
        console.log(`    Pool created via factory: ${poolAddr}`);

        // Initialize
        if (poolAddr !== ZERO_ADDR) {
          await sendTx({ address: poolAddr, abi: POOL_ABI, functionName: 'initialize', args: [sqrtPrice], gas: 500000n });
          console.log(`    Pool initialized!`);
        }
      } catch (err2: any) {
        console.error(`    Factory fallback also failed: ${err2.message?.slice(0, 200)}`);
      }
    }
  }

  console.log('\n=== STEP 4: Add liquidity ===');

  const liquidityConfig = [
    {
      name: 'USDC/WETH',
      tokenA: USDC, tokenB: WETH,
      amountA: 1000n * 10n ** 6n,      // 1000 USDC
      amountB: 400000000000000000n,     // 0.4 WETH (~$1000 at $2500)
    },
    {
      name: 'USDC/WBTC',
      tokenA: USDC, tokenB: WBTC,
      amountA: 1000n * 10n ** 6n,      // 1000 USDC
      amountB: 1030000n,               // 0.01030000 WBTC (~$1000 at $97K)
    },
    {
      name: 'WETH/WBTC',
      tokenA: WETH, tokenB: WBTC,
      amountA: 400000000000000000n,     // 0.4 WETH (~$1000)
      amountB: 1030000n,               // 0.0103 WBTC (~$1000)
    },
  ];

  for (const liq of liquidityConfig) {
    const [token0, token1] = sortTokens(liq.tokenA, liq.tokenB);
    const amount0 = token0.toLowerCase() === liq.tokenA.toLowerCase() ? liq.amountA : liq.amountB;
    const amount1 = token0.toLowerCase() === liq.tokenA.toLowerCase() ? liq.amountB : liq.amountA;

    // Verify pool exists
    const poolAddr = await publicClient.readContract({
      address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [token0, token1],
    }) as Address;

    if (poolAddr === ZERO_ADDR) {
      console.log(`  ${liq.name}: No pool exists, skipping`);
      continue;
    }

    console.log(`  ${liq.name}: adding ${amount0} token0, ${amount1} token1 to ${poolAddr.slice(0, 14)}...`);

    try {
      const hash = await sendTx({
        address: POSITION_MANAGER,
        abi: NFT_PM_ABI,
        functionName: 'mint',
        args: [{
          token0,
          token1,
          deployer: ZERO_ADDR,  // standard pool (not custom)
          tickLower: -887220,   // full range (divisible by 60 = default tick spacing)
          tickUpper: 887220,
          amount0Desired: amount0,
          amount1Desired: amount1,
          amount0Min: 0n,
          amount1Min: 0n,
          recipient: account.address,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
        }],
        gas: 5000000n,
      });
      console.log(`    Liquidity added! tx: ${hash.slice(0, 14)}...`);
    } catch (err: any) {
      console.error(`    Failed: ${err.message?.slice(0, 300)}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  for (const pool of pools) {
    const [token0, token1] = sortTokens(pool.tokenA, pool.tokenB);
    const poolAddr = await publicClient.readContract({
      address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [token0, token1],
    }) as Address;
    const exists = poolAddr !== ZERO_ADDR;
    console.log(`  ${pool.name}: ${exists ? poolAddr : 'NOT CREATED'}`);
  }

  // Print updated balances
  const wethFinal = await publicClient.readContract({ address: WETH, abi: MINTABLE_ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const wbtcFinal = await publicClient.readContract({ address: WBTC, abi: MINTABLE_ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const usdcFinal = await publicClient.readContract({ address: USDC, abi: MINTABLE_ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  console.log(`\n  Final balances: ${Number(usdcFinal) / 1e6} USDC, ${Number(wethFinal) / 1e18} WETH, ${Number(wbtcFinal) / 1e8} WBTC`);
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
