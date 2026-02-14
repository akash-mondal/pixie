#!/usr/bin/env npx tsx
// Check if SwapRouter's computed pool address matches the actual pool address
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

import { createPublicClient, http, type Address, parseAbi, keccak256, encodePacked, encodeAbiParameters, parseAbiParameters, getAddress, getCode } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const chain = { id: 103698795, name: 'BITE V2', nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' }, rpcUrls: { default: { http: [RPC] } } } as const;
const pc = createPublicClient({ chain: chain as any, transport: http(RPC) });

const SR = '0x3012E9049d05B4B5369D690114D5A5861EbB85cb' as Address;
const FACTORY = '0x10253594A832f967994b44f33411940533302ACb' as Address;
const POOL_DEPLOYER = '0xd7cB0E0692f2D55A17bA81c1fE5501D66774fC4A' as Address;

// Old tokens (broken price pools)
const OLD_USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const OLD_WETH = '0x4c1928684b7028c2805fa1d12aced5c839a8d42c' as Address;

// New tokens (fresh pools)
const NEW_WETH = '0x40f7c49d1310ef5e1f2bd3a31bee123ac70cf518' as Address;
const NEW_WBTC = '0x63fcc83709a0af768675c1daaf5ec60832232aee' as Address;

const FACTORY_ABI = parseAbi([
  'function poolByPair(address, address) view returns (address)',
]);

// Known POOL_INIT_CODE_HASH from Algebra source
const KNOWN_HASH = '0x62441ebe4e4315cf3d49d5957f94d66b253dbabe7006f34ad7f70947e60bf15c';

function sortTokens(a: Address, b: Address): [Address, Address] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

function computePoolAddress(deployer: Address, tokenA: Address, tokenB: Address, initCodeHash: string, poolDeployerAddr: Address = '0x0000000000000000000000000000000000000000' as Address): Address {
  const [token0, token1] = sortTokens(tokenA, tokenB);

  // For standard pools (deployer = address(0)): salt = keccak256(abi.encode(token0, token1))
  // For custom pools: salt = keccak256(abi.encode(deployer, token0, token1))
  const salt = poolDeployerAddr === '0x0000000000000000000000000000000000000000' as Address
    ? keccak256(encodeAbiParameters(parseAbiParameters('address, address'), [token0, token1]))
    : keccak256(encodeAbiParameters(parseAbiParameters('address, address, address'), [poolDeployerAddr, token0, token1]));

  const data = encodePacked(
    ['bytes1', 'address', 'bytes32', 'bytes32'],
    ['0xff', deployer, salt, initCodeHash as `0x${string}`]
  );
  const hash = keccak256(data);
  return getAddress('0x' + hash.slice(-40));
}

async function main() {
  console.log('=== POOL ADDRESS COMPARISON ===\n');

  // 1. Get poolDeployer from SwapRouter
  let srPoolDeployer: Address;
  try {
    srPoolDeployer = await pc.readContract({
      address: SR,
      abi: parseAbi(['function poolDeployer() view returns (address)']),
      functionName: 'poolDeployer',
    }) as Address;
    console.log('SwapRouter.poolDeployer():', srPoolDeployer);
  } catch {
    console.log('SwapRouter.poolDeployer() failed, using known POOL_DEPLOYER');
    srPoolDeployer = POOL_DEPLOYER;
  }
  console.log('Known PoolDeployer:', POOL_DEPLOYER);

  // 2. Test with old pools (broken prices)
  const testPairs = [
    { name: 'OLD USDC/WETH', a: OLD_USDC, b: OLD_WETH },
    { name: 'NEW USDC/WETH', a: OLD_USDC, b: NEW_WETH },
    { name: 'NEW USDC/WBTC', a: OLD_USDC, b: NEW_WBTC },
  ];

  for (const pair of testPairs) {
    const [t0, t1] = sortTokens(pair.a, pair.b);
    const actual = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [t0, t1] }) as Address;

    if (actual === '0x0000000000000000000000000000000000000000') {
      console.log(`\n${pair.name}: No pool`);
      continue;
    }

    // Compute address using known hash
    const computed = computePoolAddress(srPoolDeployer, pair.a, pair.b, KNOWN_HASH);

    console.log(`\n${pair.name}:`);
    console.log(`  Actual:   ${actual}`);
    console.log(`  Computed: ${computed}`);
    console.log(`  MATCH: ${actual.toLowerCase() === computed.toLowerCase()}`);

    // If no match, try to find the real init code hash
    if (actual.toLowerCase() !== computed.toLowerCase()) {
      // Get pool bytecode hash
      const poolCode = await pc.getCode({ address: actual });
      if (poolCode) {
        const runtimeHash = keccak256(poolCode);
        console.log(`  Pool runtime code hash: ${runtimeHash}`);
        console.log(`  (Note: init code hash ≠ runtime code hash)`);
      }
    }
  }

  // 3. Check if there's a code at the COMPUTED address (should be empty if mismatch)
  console.log('\n=== CODE AT COMPUTED ADDRESSES ===');
  for (const pair of testPairs) {
    const [t0, t1] = sortTokens(pair.a, pair.b);
    const actual = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [t0, t1] }) as Address;
    if (actual === '0x0000000000000000000000000000000000000000') continue;

    const computed = computePoolAddress(srPoolDeployer, pair.a, pair.b, KNOWN_HASH);
    const codeAtComputed = await pc.getCode({ address: computed });
    const codeAtActual = await pc.getCode({ address: actual });
    console.log(`${pair.name}:`);
    console.log(`  Code at actual (${actual.slice(0,10)}): ${codeAtActual ? codeAtActual.length + ' chars' : 'NONE'}`);
    console.log(`  Code at computed (${computed.slice(0,10)}): ${codeAtComputed ? codeAtComputed.length + ' chars' : 'NONE'}`);
  }

  // 4. Check the successful USDC/MTK pool from subgraph
  console.log('\n=== USDC/MTK POOL (known working) ===');
  // Try to find MTK token address by querying factory
  // The subgraph showed pool at 0xb6713b9e...5b874d
  // Let's read its token0 and token1
  const mtk_pool = '0xb6713b9e23aeffa96bdce7dff68bbf25f0b5874d' as Address;
  try {
    const t0 = await pc.readContract({ address: mtk_pool, abi: parseAbi(['function token0() view returns (address)']), functionName: 'token0' }) as Address;
    const t1 = await pc.readContract({ address: mtk_pool, abi: parseAbi(['function token1() view returns (address)']), functionName: 'token1' }) as Address;
    console.log(`  token0: ${t0}`);
    console.log(`  token1: ${t1}`);

    // Compute its address
    const computedMtk = computePoolAddress(srPoolDeployer, t0, t1, KNOWN_HASH);
    console.log(`  Actual:   ${mtk_pool}`);
    console.log(`  Computed: ${computedMtk}`);
    console.log(`  MATCH: ${mtk_pool.toLowerCase() === computedMtk.toLowerCase()}`);

    // Also check runtime code hash vs our pools
    const mtkCode = await pc.getCode({ address: mtk_pool });
    const mtkHash = mtkCode ? keccak256(mtkCode) : 'N/A';
    console.log(`  Runtime code hash: ${mtkHash}`);

    // Compare with our pool
    const [ot0, ot1] = sortTokens(OLD_USDC, OLD_WETH);
    const ourPool = await pc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'poolByPair', args: [ot0, ot1] }) as Address;
    const ourCode = await pc.getCode({ address: ourPool });
    const ourHash = ourCode ? keccak256(ourCode) : 'N/A';
    console.log(`  Our USDC/WETH runtime hash: ${ourHash}`);
    console.log(`  Same bytecode: ${mtkHash === ourHash}`);
  } catch (e: any) {
    console.log(`  Failed: ${e.message?.slice(0, 100)}`);
  }
}

main().catch(console.error);
