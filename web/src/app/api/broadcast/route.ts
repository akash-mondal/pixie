// POST /api/broadcast — Execute a USDC transfer using a provided private key
// The CDP wallet can't send transactions to SKALE from the browser,
// so the client exports the key and the server executes the transfer
// using the same proven pattern as the server wallet.

import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http, parseAbi, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { biteSandbox } from '@/lib/chain';
import { getServerWalletClient, getServerPublicClient } from '@/lib/server-wallet';

const RPC_URL = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

const MIN_SFUEL = 500000000000000n; // 0.0005 sFUEL
const SFUEL_TOPUP = 1000000000000000n; // 0.001 sFUEL

export async function POST(req: NextRequest) {
  try {
    const { privateKey, to, amount } = await req.json();

    if (!privateKey || !to || !amount) {
      return NextResponse.json({ error: 'Missing privateKey, to, or amount' }, { status: 400 });
    }

    // Normalize key format
    const pkHex = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(pkHex as `0x${string}`);
    const amountAtomic = BigInt(Math.round(amount * 1e6));

    const pc = createPublicClient({ chain: biteSandbox, transport: http(RPC_URL) });

    // Check USDC balance
    const balance = await pc.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    }) as bigint;

    if (balance < amountAtomic) {
      return NextResponse.json({
        error: `Insufficient USDC: $${(Number(balance) / 1e6).toFixed(2)} available`,
      }, { status: 400 });
    }

    // Ensure user wallet has sFUEL for gas (same pattern as fundAgentSfuel)
    const sfuelBalance = await pc.getBalance({ address: account.address });
    if (sfuelBalance < MIN_SFUEL) {
      console.log(`[broadcast] User ${account.address.slice(0, 10)} needs sFUEL (${sfuelBalance}), sending ${SFUEL_TOPUP}...`);
      const serverWc = getServerWalletClient();
      const sfuelHash = await serverWc.sendTransaction({
        to: account.address,
        value: SFUEL_TOPUP,
        gas: 21000n,
        type: 'legacy' as any,
      } as any);
      await pc.waitForTransactionReceipt({ hash: sfuelHash });
      console.log(`[broadcast] sFUEL sent to ${account.address.slice(0, 10)} — tx: ${sfuelHash.slice(0, 14)}...`);
    }

    // Execute USDC transfer (same pattern as server-wallet — lets viem handle gasPrice)
    const wc = createWalletClient({ account, chain: biteSandbox, transport: http(RPC_URL) });
    const hash = await wc.writeContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to as `0x${string}`, amountAtomic],
      gas: 100000n,
      type: 'legacy' as any,
    } as any);

    await pc.waitForTransactionReceipt({ hash });

    console.log(`[broadcast] User ${account.address.slice(0, 10)} → ${to.slice(0, 10)}: $${amount} USDC — tx: ${hash.slice(0, 14)}...`);

    return NextResponse.json({ txHash: hash, from: account.address });
  } catch (err: any) {
    console.error('[broadcast] Error:', err.message);
    return NextResponse.json({ error: err.message || 'Transfer failed' }, { status: 500 });
  }
}
