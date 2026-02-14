// Real DEX swap execution on Algebra Finance — agent wallets execute ACTUAL swaps
// Agents approve tokens, swap via SwapRouter, and we track real on-chain balances

import { parseAbi, type Address, type Hash } from 'viem';
import { writeAgentContract, waitForAgentTx, getAgentAddress, getAgentWallet } from './agent-wallet';
import { getServerPublicClient } from './server-wallet';
import { ALGEBRA_SWAP_ROUTER, USDC_ADDRESS, TOKENS, PAIRS, SWAP_ROUTER_ABI, QUOTER_V2_ABI, ALGEBRA_QUOTER } from './algebra';

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]);

// Track which (agentId, token) combos have been approved
const approvedSet = new Set<string>();

// --- Approve token for SwapRouter (max approval, idempotent) ---

export async function approveForSwap(
  agentId: string,
  tokenAddress: Address,
): Promise<string | null> {
  const key = `${agentId}:${tokenAddress}`;
  if (approvedSet.has(key)) return null;

  try {
    const maxUint = 2n ** 256n - 1n;
    const hash = await writeAgentContract(agentId, {
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [ALGEBRA_SWAP_ROUTER, maxUint],
      gas: 100000n,
    });
    await waitForAgentTx(hash);
    approvedSet.add(key);
    console.log(`[dex-swap] ${agentId} approved ${tokenAddress} to SwapRouter — tx: ${hash.slice(0, 14)}...`);
    return hash;
  } catch (err: any) {
    console.error(`[dex-swap] Approval failed for ${agentId}:`, err.message);
    return null;
  }
}

// --- Approve token to a specific spender (for x402 on-chain settlement) ---

export async function approveTokenTo(
  agentId: string,
  tokenAddress: Address,
  spender: Address,
): Promise<string | null> {
  const key = `${agentId}:${tokenAddress}:${spender}`;
  if (approvedSet.has(key)) return null;

  try {
    const maxUint = 2n ** 256n - 1n;
    const hash = await writeAgentContract(agentId, {
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, maxUint],
      gas: 100000n,
    });
    await waitForAgentTx(hash);
    approvedSet.add(key);
    console.log(`[dex-swap] ${agentId} approved ${tokenAddress.slice(0, 8)}... to ${spender.slice(0, 8)}...`);
    return hash;
  } catch (err: any) {
    console.error(`[dex-swap] Approval to ${spender.slice(0, 8)} failed for ${agentId}:`, err.message);
    return null;
  }
}

// --- Execute real swap via Algebra SwapRouter.exactInputSingle ---

export async function executeRealSwap(agentId: string, params: {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  recipient: Address;
}): Promise<{ amountOut: bigint; txHash: string }> {
  // Ensure token is approved
  await approveForSwap(agentId, params.tokenIn);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const hash = await writeAgentContract(agentId, {
    address: ALGEBRA_SWAP_ROUTER,
    abi: SWAP_ROUTER_ABI,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      deployer: '0x0000000000000000000000000000000000000000' as Address, // standard pool
      recipient: params.recipient,
      deadline,
      amountIn: params.amountIn,
      amountOutMinimum: 0n, // accept any output for demo
      limitSqrtPrice: 0n,
    }],
    gas: 12000000n, // Algebra plugin hooks (BEFORE_SWAP + AFTER_SWAP + DYNAMIC_FEE) need ~8M gas
  });

  const receipt = await waitForAgentTx(hash);

  // Parse amountOut from Transfer event on tokenOut
  const amountOut = parseSwapAmountOut(receipt, params.tokenOut, params.recipient);

  console.log(`[dex-swap] ${agentId} swapped ${params.amountIn} ${params.tokenIn.slice(0, 8)}... → ${amountOut} ${params.tokenOut.slice(0, 8)}... tx: ${hash.slice(0, 14)}...`);

  return { amountOut, txHash: hash };
}

// Parse amountOut from Transfer events in receipt
function parseSwapAmountOut(receipt: any, tokenOut: Address, recipient: Address): bigint {
  const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // Transfer(address,address,uint256)

  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === tokenOut.toLowerCase() &&
      log.topics[0] === transferTopic
    ) {
      // Transfer event: topics[1]=from, topics[2]=to, data=amount
      const to = '0x' + log.topics[2].slice(26);
      if (to.toLowerCase() === recipient.toLowerCase()) {
        return BigInt(log.data);
      }
    }
  }

  // Fallback: check balance diff
  return 0n;
}

// --- Read on-chain ERC20 balance ---

export async function getOnChainBalance(
  walletAddress: Address,
  tokenAddress: Address,
): Promise<bigint> {
  const pc = getServerPublicClient();
  return await pc.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
  }) as bigint;
}

// --- Get quote from QuoterV2 (non-destructive price check) ---

export async function getSwapQuote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<bigint | null> {
  if (amountIn === 0n) return 0n;
  try {
    const pc = getServerPublicClient();
    const result = await pc.readContract({
      address: ALGEBRA_QUOTER,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{ tokenIn, tokenOut, deployer: '0x0000000000000000000000000000000000000000' as Address, amountIn, limitSqrtPrice: 0n }],
    });
    return (result as any)[0] as bigint;
  } catch (err: any) {
    console.warn(`[dex-swap] Quote failed ${tokenIn.slice(0, 8)}→${tokenOut.slice(0, 8)}:`, err.message);
    return null;
  }
}

// --- Calculate real P&L from on-chain balances ---

export async function calculateRealPnL(
  agentId: string,
  startingUsdc: bigint,
): Promise<{ pnlBps: number; usdcValue: bigint }> {
  const walletAddress = getAgentAddress(agentId);

  // Get USDC balance
  let totalUsdcValue = await getOnChainBalance(walletAddress, USDC_ADDRESS);

  // Get non-USDC token balances and quote them in USDC
  const nonUsdcTokens = [
    { symbol: 'WETH', address: TOKENS.WETH.address },
    { symbol: 'WBTC', address: TOKENS.WBTC.address },
  ];

  for (const token of nonUsdcTokens) {
    const balance = await getOnChainBalance(walletAddress, token.address);
    if (balance > 0n) {
      const quote = await getSwapQuote(token.address, USDC_ADDRESS, balance);
      if (quote !== null) {
        totalUsdcValue += quote;
      }
    }
  }

  // P&L in basis points: (current - starting) / starting * 10000
  const pnlBps = startingUsdc > 0n
    ? Number((totalUsdcValue - startingUsdc) * 10000n / startingUsdc)
    : 0;

  return { pnlBps, usdcValue: totalUsdcValue };
}

// --- Unwind all non-USDC positions back to USDC ---

export async function unwindToUsdc(agentId: string): Promise<{
  finalUsdcBalance: bigint;
  txHashes: string[];
}> {
  const walletAddress = getAgentAddress(agentId);
  const txHashes: string[] = [];

  const nonUsdcTokens = [
    { symbol: 'WETH', address: TOKENS.WETH.address },
    { symbol: 'WBTC', address: TOKENS.WBTC.address },
  ];

  for (const token of nonUsdcTokens) {
    const balance = await getOnChainBalance(walletAddress, token.address);
    if (balance > 0n) {
      try {
        const { txHash } = await executeRealSwap(agentId, {
          tokenIn: token.address,
          tokenOut: USDC_ADDRESS,
          amountIn: balance,
          recipient: walletAddress,
        });
        txHashes.push(txHash);
        console.log(`[dex-swap] Unwound ${token.symbol} for ${agentId}: ${txHash.slice(0, 14)}...`);
      } catch (err: any) {
        console.error(`[dex-swap] Unwind ${token.symbol} failed for ${agentId}:`, err.message);
      }
    }
  }

  const finalUsdcBalance = await getOnChainBalance(walletAddress, USDC_ADDRESS);
  return { finalUsdcBalance, txHashes };
}

// --- Resolve token addresses for a trading pair ---

export function resolveSwapTokens(pair: string, direction: 'buy' | 'sell'): {
  tokenIn: Address;
  tokenOut: Address;
} {
  const pairData = PAIRS[pair];
  if (!pairData) throw new Error(`Unknown pair: ${pair}`);

  // For "ETH/USDC" — buy means USDC→WETH, sell means WETH→USDC
  if (direction === 'buy') {
    return {
      tokenIn: TOKENS[pairData.token0].address,  // USDC
      tokenOut: TOKENS[pairData.token1].address,  // WETH
    };
  } else {
    return {
      tokenIn: TOKENS[pairData.token1].address,  // WETH
      tokenOut: TOKENS[pairData.token0].address,  // USDC
    };
  }
}
