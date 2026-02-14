#!/usr/bin/env npx tsx
// Deploy fresh tokens + create pools with CORRECT prices + verify swaps
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

import { createWalletClient, createPublicClient, http, parseAbi, type Address, type Hex, encodeDeployData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const chain = { id: 103698795, name: 'BITE V2', nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' }, rpcUrls: { default: { http: [RPC] } } } as const;
const account = privateKeyToAccount(process.env.SERVER_PK as `0x${string}`);
const wc = createWalletClient({ account, chain: chain as any, transport: http(RPC) });
const pc = createPublicClient({ chain: chain as any, transport: http(RPC) });

const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const FACTORY = '0x10253594A832f967994b44f33411940533302ACb' as Address;
const PM = '0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F' as Address;
const SR = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb' as Address;
const QUOTER = '0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;

// Load compiled bytecode
const artifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../contracts/out/TestToken.sol/TestToken.json'), 'utf-8'));
const bytecode = artifact.bytecode.object as Hex;
const tokenAbi = artifact.abi;

const ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount) external',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const FACTORY_ABI = parseAbi(['function poolByPair(address, address) view returns (address)']);
const POOL_ABI = parseAbi([
  'function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)',
]);

const PM_INIT_ABI = parseAbi([
  'function createAndInitializePoolIfNecessary(address token0, address token1, address deployer, uint160 sqrtPriceX96, bytes data) payable returns (address pool)',
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

// CORRECT sqrtPriceX96:
// humanPrice = token1 per token0 (pool-native)
// rawPrice = humanPrice * 10^(dec1 - dec0)
// sqrtPriceX96 = sqrt(rawPrice) * 2^96
function priceToSqrtPriceX96(humanPrice: number, dec0: number, dec1: number): bigint {
  const rawPrice = humanPrice * Math.pow(10, dec1 - dec0);
  const sqrtPrice = Math.sqrt(rawPrice);
  return BigInt(Math.round(sqrtPrice * Number(2n ** 96n)));
}

async function sendTx(params: { address: Address; abi: any; functionName: string; args?: any[]; gas?: bigint }) {
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

  // ===== STEP 1: Deploy fresh tokens =====
  console.log('\n=== DEPLOYING FRESH TOKENS ===');

  const deployToken = async (name: string, symbol: string, decimals: number): Promise<Address> => {
    const deployData = encodeDeployData({ abi: tokenAbi, bytecode, args: [name, symbol, decimals] });
    const hash = await wc.sendTransaction({ data: deployData, gas: 3000000n, type: 'legacy' as any } as any);
    const receipt = await pc.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error('No contract address');
    console.log(`  ${symbol}: ${receipt.contractAddress}`);
    return receipt.contractAddress as Address;
  };

  const WETH = await deployToken('Wrapped Ether', 'WETH', 18);
  const WBTC = await deployToken('Wrapped Bitcoin', 'WBTC', 8);

  // Mint tokens
  console.log('\n  Minting...');
  await sendTx({ address: WETH, abi: ERC20_ABI, functionName: 'mint', args: [account.address, 1000n * 10n**18n] });
  await sendTx({ address: WBTC, abi: ERC20_ABI, functionName: 'mint', args: [account.address, 100n * 10n**8n] });

  // Approve all to PM and SR
  console.log('  Approving...');
  const max = 2n ** 256n - 1n;
  for (const [, addr] of [['USDC', USDC], ['WETH', WETH], ['WBTC', WBTC]] as const) {
    for (const sp of [PM, SR]) {
      await sendTx({ address: addr, abi: ERC20_ABI, functionName: 'approve', args: [sp, max], gas: 100000n });
    }
  }

  // ===== STEP 2: Create pools with CORRECT prices =====
  console.log('\n=== CREATING POOLS ===');

  // Pool configs:
  // humanPriceAB = "how many tokenA per 1 tokenB" (e.g., 2500 USDC per WETH)
  const pools = [
    { name: 'USDC/WETH', tokenA: USDC, tokenB: WETH, decA: 6, decB: 18, humanPriceAB: 2500 },
    { name: 'USDC/WBTC', tokenA: USDC, tokenB: WBTC, decA: 6, decB: 8, humanPriceAB: 97000 },
    { name: 'WETH/WBTC', tokenA: WETH, tokenB: WBTC, decA: 18, decB: 8, humanPriceAB: 38.8 },
  ];

  for (const pool of pools) {
    const [token0, token1] = sortTokens(pool.tokenA, pool.tokenB);
    const isSwapped = token0.toLowerCase() !== pool.tokenA.toLowerCase();
    const dec0 = isSwapped ? pool.decB : pool.decA;
    const dec1 = isSwapped ? pool.decA : pool.decB;

    // CORRECTED: humanPriceAB = tokenA per tokenB
    // If swapped (token0=tokenB, token1=tokenA): pool price = token1/token0 = tokenA/tokenB = humanPriceAB
    // If NOT swapped (token0=tokenA, token1=tokenB): pool price = token1/token0 = tokenB/tokenA = 1/humanPriceAB
    const humanPrice = isSwapped ? pool.humanPriceAB : (1 / pool.humanPriceAB);

    const sqrtPrice = priceToSqrtPriceX96(humanPrice, dec0, dec1);

    // Verify the price
    const checkPrice = (Number(sqrtPrice) / Number(2n ** 96n)) ** 2 * Math.pow(10, dec0 - dec1);
    console.log(`\n  ${pool.name}: token0=${token0.slice(0,10)} dec${dec0}, token1=${token1.slice(0,10)} dec${dec1}`);
    console.log(`    humanPrice(t1/t0)=${humanPrice}, sqrtPriceX96=${sqrtPrice}`);
    console.log(`    verify: ${checkPrice.toFixed(4)} (want ${humanPrice.toFixed(4)})`);

    const hash = await sendTx({
      address: PM, abi: PM_INIT_ABI,
      functionName: 'createAndInitializePoolIfNecessary',
      args: [token0, token1, ZERO, sqrtPrice, '0x'],
      gas: 15000000n,
    });
    const poolAddr = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [token0, token1] }) as Address;
    const state = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'globalState' }) as any;
    console.log(`    pool: ${poolAddr}, tick: ${Number(state[1])}`);
  }

  // ===== STEP 3: Add liquidity =====
  console.log('\n=== ADDING LIQUIDITY ===');

  const liqConfigs = [
    { name: 'USDC/WETH', tokenA: USDC, tokenB: WETH, amountA: 2500n * 10n**6n, amountB: 1n * 10n**18n },
    { name: 'USDC/WBTC', tokenA: USDC, tokenB: WBTC, amountA: 5000n * 10n**6n, amountB: 5154639n },
    { name: 'WETH/WBTC', tokenA: WETH, tokenB: WBTC, amountA: 2n * 10n**18n, amountB: 5154639n },
  ];

  for (const liq of liqConfigs) {
    const [token0, token1] = sortTokens(liq.tokenA, liq.tokenB);
    const amount0 = token0.toLowerCase() === liq.tokenA.toLowerCase() ? liq.amountA : liq.amountB;
    const amount1 = token0.toLowerCase() === liq.tokenA.toLowerCase() ? liq.amountB : liq.amountA;

    console.log(`  ${liq.name}: ${amount0} token0, ${amount1} token1`);
    const hash = await sendTx({
      address: PM, abi: PM_MINT_ABI, functionName: 'mint',
      args: [{
        token0, token1, deployer: ZERO, tickLower: -887220, tickUpper: 887220,
        amount0Desired: amount0, amount1Desired: amount1, amount0Min: 0n, amount1Min: 0n,
        recipient: account.address, deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      }],
      gas: 15000000n,
    });
    console.log(`    Done: ${hash.slice(0, 14)}...`);
  }

  // ===== STEP 4: Verify quotes =====
  console.log('\n=== QUOTE VERIFICATION ===');
  const quoteTests = [
    { name: '1 USDC → WETH', tIn: USDC, tOut: WETH, amt: 1000000n, decOut: 18, expect: '~0.0004' },
    { name: '0.001 WETH → USDC', tIn: WETH, tOut: USDC, amt: 10n**15n, decOut: 6, expect: '~2.50' },
    { name: '1 USDC → WBTC', tIn: USDC, tOut: WBTC, amt: 1000000n, decOut: 8, expect: '~0.0000103' },
    { name: '0.001 WBTC → USDC', tIn: WBTC, tOut: USDC, amt: 100000n, decOut: 6, expect: '~97.00' },
    { name: '0.01 WETH → WBTC', tIn: WETH, tOut: WBTC, amt: 10n**16n, decOut: 8, expect: '~0.000258' },
  ];

  for (const qt of quoteTests) {
    try {
      const r = await pc.readContract({
        address: QUOTER, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: qt.tIn, tokenOut: qt.tOut, deployer: ZERO, amountIn: qt.amt, limitSqrtPrice: 0n }],
      });
      const out = Number(r[0]) / Math.pow(10, qt.decOut);
      console.log(`  ${qt.name} → ${out.toFixed(8)} (expect ${qt.expect})`);
    } catch (e: any) {
      console.log(`  ${qt.name} → FAILED: ${e.message?.slice(0, 80)}`);
    }
  }

  // ===== STEP 5: Test actual swaps =====
  console.log('\n=== SWAP TESTS (12M gas) ===');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Swap 1 USDC → WETH
  console.log('  1 USDC → WETH...');
  try {
    const hash = await wc.writeContract({
      address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn: USDC, tokenOut: WETH, deployer: ZERO, recipient: account.address, deadline,
        amountIn: 1000000n, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
      gas: 12000000n, type: 'legacy' as any,
    } as any);
    const receipt = await pc.waitForTransactionReceipt({ hash });
    // Parse transfer
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    for (const log of receipt.logs) {
      if (log.topics[0] === transferTopic && log.address.toLowerCase() === WETH.toLowerCase()) {
        const amt = BigInt(log.data);
        console.log(`    Got: ${Number(amt) / 1e18} WETH (effective: 1 WETH = ${1e18 / Number(amt)} USDC)`);
      }
    }
    console.log(`    Status: ${receipt.status}, gas: ${receipt.gasUsed}`);
  } catch (e: any) {
    console.log(`    FAILED: ${e.message?.slice(0, 100)}`);
  }

  // Swap 0.001 WETH → USDC
  console.log('  0.001 WETH → USDC...');
  try {
    const hash = await wc.writeContract({
      address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn: WETH, tokenOut: USDC, deployer: ZERO, recipient: account.address, deadline,
        amountIn: 10n**15n, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
      gas: 12000000n, type: 'legacy' as any,
    } as any);
    const receipt = await pc.waitForTransactionReceipt({ hash });
    for (const log of receipt.logs) {
      if (log.topics[0] === transferTopic && log.address.toLowerCase() === USDC.toLowerCase()) {
        const to = '0x' + (log.topics[2] || '').slice(26);
        if (to.toLowerCase() === account.address.toLowerCase()) {
          const amt = BigInt(log.data);
          console.log(`    Got: ${Number(amt) / 1e6} USDC (effective: 1 WETH = ${Number(amt) / 1e6 / 0.001} USDC)`);
        }
      }
    }
    console.log(`    Status: ${receipt.status}, gas: ${receipt.gasUsed}`);
  } catch (e: any) {
    console.log(`    FAILED: ${e.message?.slice(0, 100)}`);
  }

  // ===== SUMMARY =====
  console.log('\n============================');
  console.log('=== FINAL TOKEN ADDRESSES ===');
  console.log('============================');
  console.log(`WETH: ${WETH}`);
  console.log(`WBTC: ${WBTC}`);
  console.log(`USDC: ${USDC}`);

  console.log('\n=== POOL ADDRESSES ===');
  for (const [name, a, b] of [['USDC/WETH', USDC, WETH], ['USDC/WBTC', USDC, WBTC], ['WETH/WBTC', WETH, WBTC]] as const) {
    const [t0, t1] = sortTokens(a, b);
    const pool = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [t0, t1] }) as Address;
    console.log(`  ${name}: ${pool}`);
  }

  console.log('\nUpdate algebra.ts with:');
  console.log(`export const WETH_ADDRESS = '${WETH}' as Address;`);
  console.log(`export const WBTC_ADDRESS = '${WBTC}' as Address;`);
}

main().catch(console.error);
