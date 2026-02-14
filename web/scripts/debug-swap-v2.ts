#!/usr/bin/env npx tsx
// Deep debug: Check pool plugin, simulate swap, try raw calldata
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

// New tokens
const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const WETH = '0x40f7c49d1310ef5e1f2bd3a31bee123ac70cf518' as Address;
const SR = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb' as Address;
const FACTORY = '0x10253594A832f967994b44f33411940533302ACb' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;

const POOL_ABI = parseAbi([
  'function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)',
  'function plugin() view returns (address)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function liquidity() view returns (uint128)',
]);

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

function sortTokens(a: Address, b: Address): [Address, Address] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

async function main() {
  console.log('Server:', account.address);

  // 1. Get pool address for NEW USDC/WETH
  const [t0, t1] = sortTokens(USDC, WETH);
  const poolAddr = await pc.readContract({
    address: FACTORY, abi: parseAbi(['function poolByPair(address, address) view returns (address)']),
    functionName: 'poolByPair', args: [t0, t1],
  }) as Address;
  console.log('\nPool:', poolAddr);

  // 2. Pool state
  const state = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'globalState' }) as any;
  console.log('  sqrtPriceX96:', state[0].toString());
  console.log('  tick:', Number(state[1]));
  console.log('  fee:', Number(state[2]));
  console.log('  pluginConfig:', Number(state[3]));
  console.log('  communityFee:', Number(state[4]));
  console.log('  unlocked:', Boolean(state[5]));

  // 3. Plugin
  const plugin = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'plugin' }) as Address;
  console.log('  plugin:', plugin);
  console.log('  has plugin:', plugin !== ZERO);

  // If plugin exists, check its code size
  if (plugin !== ZERO) {
    const code = await pc.getCode({ address: plugin });
    console.log('  plugin code size:', code ? code.length : 0);
  }

  // Decode pluginConfig flags
  const pConfig = Number(state[3]);
  console.log('\n  Plugin flags:');
  console.log('    BEFORE_SWAP (bit0):', !!(pConfig & 1));
  console.log('    AFTER_SWAP (bit1):', !!(pConfig & 2));
  console.log('    BEFORE_FLASH (bit2):', !!(pConfig & 4));
  console.log('    AFTER_FLASH (bit3):', !!(pConfig & 8));
  console.log('    AFTER_INIT (bit4):', !!(pConfig & 16));
  console.log('    BEFORE_MODIFY_POS (bit5):', !!(pConfig & 32));
  console.log('    AFTER_MODIFY_POS (bit6):', !!(pConfig & 64));
  console.log('    DYNAMIC_FEE (bit7):', !!(pConfig & 128));

  // 4. Pool liquidity and tokens
  const liq = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'liquidity' }) as bigint;
  const pt0 = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'token0' }) as Address;
  const pt1 = await pc.readContract({ address: poolAddr, abi: POOL_ABI, functionName: 'token1' }) as Address;
  console.log('\n  liquidity:', liq.toString());
  console.log('  token0:', pt0);
  console.log('  token1:', pt1);

  // 5. Try simulateContract for detailed error
  console.log('\n=== SIMULATE SWAP ===');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  try {
    const result = await pc.simulateContract({
      address: SR,
      abi: SWAP_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: USDC, tokenOut: WETH, deployer: ZERO,
        recipient: account.address, deadline,
        amountIn: 1000000n, // 1 USDC
        amountOutMinimum: 0n, limitSqrtPrice: 0n,
      }],
      account: account.address,
    });
    console.log('  Simulation SUCCESS! amountOut:', result.result);
  } catch (e: any) {
    console.log('  Simulation FAILED:');
    console.log('    shortMessage:', e.shortMessage);
    console.log('    details:', e.details?.slice(0, 300));
    console.log('    cause:', e.cause?.message?.slice(0, 300));
    if (e.cause?.data) console.log('    revert data:', e.cause.data);
  }

  // 6. Try raw eth_call with explicit params
  console.log('\n=== RAW ETH_CALL ===');
  const calldata = encodeFunctionData({
    abi: SWAP_ABI,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn: USDC, tokenOut: WETH, deployer: ZERO,
      recipient: account.address, deadline,
      amountIn: 1000000n, amountOutMinimum: 0n, limitSqrtPrice: 0n,
    }],
  });
  console.log('  calldata:', calldata.slice(0, 80) + '...');

  try {
    const transport = http(RPC);
    const response = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{
          from: account.address,
          to: SR,
          data: calldata,
          gas: '0xF4240', // 1000000
        }, 'latest'],
      }),
    });
    const json = await response.json();
    console.log('  Result:', JSON.stringify(json).slice(0, 500));
  } catch (e: any) {
    console.log('  Error:', e.message?.slice(0, 300));
  }

  // 7. Try swap with different gas amounts
  console.log('\n=== SWAP WITH VARYING GAS ===');
  for (const gas of [300000n, 1000000n, 5000000n, 10000000n]) {
    try {
      const hash = await wc.writeContract({
        address: SR, abi: SWAP_ABI, functionName: 'exactInputSingle',
        args: [{
          tokenIn: USDC, tokenOut: WETH, deployer: ZERO,
          recipient: account.address, deadline,
          amountIn: 100000n, // 0.10 USDC (tiny)
          amountOutMinimum: 0n, limitSqrtPrice: 0n,
        }],
        gas, type: 'legacy' as any,
      } as any);
      const receipt = await pc.waitForTransactionReceipt({ hash });
      console.log(`  gas=${gas}: status=${receipt.status}, logs=${receipt.logs.length}, gasUsed=${receipt.gasUsed}`);
      if (receipt.status === 'success') {
        console.log('  SWAP WORKS!');
        break;
      }
    } catch (e: any) {
      console.log(`  gas=${gas}: error=${e.shortMessage?.slice(0, 100) || e.message?.slice(0, 100)}`);
    }
  }

  // 8. If all fail, try calling pool.swap directly via sendTransaction
  console.log('\n=== DIRECT POOL SWAP ATTEMPT ===');
  // AlgebraPool.swap(address recipient, bool zeroToOne, int256 amountRequired, uint160 limitSqrtPrice, bytes data)
  const poolSwapAbi = parseAbi(['function swap(address, bool, int256, uint160, bytes) returns (int256, int256)']);
  const poolCalldata = encodeFunctionData({
    abi: poolSwapAbi,
    functionName: 'swap',
    args: [
      account.address,     // recipient
      false,               // zeroToOne (USDC→WETH: USDC is token1, WETH is token0, so oneToZero = false)
      100000n,             // amountRequired (positive = exactInput)
      0n,                  // limitSqrtPrice (will it set to MAX?)
      '0x' as `0x${string}`,               // callback data
    ],
  });

  try {
    const response = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'eth_call',
        params: [{
          from: account.address,
          to: poolAddr,
          data: poolCalldata,
          gas: '0xF4240',
        }, 'latest'],
      }),
    });
    const json = await response.json();
    console.log('  Direct pool call result:', JSON.stringify(json).slice(0, 500));
  } catch (e: any) {
    console.log('  Error:', e.message?.slice(0, 300));
  }
}

main().catch(console.error);
