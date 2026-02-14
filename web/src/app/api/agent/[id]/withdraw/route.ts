// POST /api/agent/[id]/withdraw — Withdraw USDC from agent wallet to user wallet
import { NextRequest, NextResponse } from 'next/server';
import { getAgentWallet } from '@/lib/agent-wallet';
import { createWalletClient, createPublicClient, http, parseAbi, type Address } from 'viem';
import { biteSandbox } from '@/lib/chain';

const RPC_URL = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { amount, toAddress } = await req.json(); // amount in USDC, toAddress = user's wallet

  if (!toAddress || !toAddress.startsWith('0x')) {
    return NextResponse.json({ error: 'Valid toAddress required' }, { status: 400 });
  }

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be > 0' }, { status: 400 });
  }

  const wallet = getAgentWallet(id);
  if (!wallet) {
    return NextResponse.json({ error: 'Agent wallet not found' }, { status: 404 });
  }

  try {
    const amountAtomic = BigInt(Math.round(amount * 1e6));
    const pc = createPublicClient({ chain: biteSandbox, transport: http(RPC_URL) });

    // Check agent has enough USDC
    const agentBalance = await pc.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [wallet.address],
    }) as bigint;

    if (agentBalance < amountAtomic) {
      const available = (Number(agentBalance) / 1e6).toFixed(2);
      return NextResponse.json({ error: `Insufficient balance. Agent has $${available}` }, { status: 400 });
    }

    // Transfer from agent wallet to user
    const walletClient = createWalletClient({
      account: wallet.account,
      chain: biteSandbox,
      transport: http(RPC_URL),
    });

    const hash = await walletClient.writeContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [toAddress as Address, amountAtomic],
      gas: 100000n,
      type: 'legacy' as any,
    } as any);

    await pc.waitForTransactionReceipt({ hash });

    // Read new balance
    const newBalance = await pc.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [wallet.address],
    }) as bigint;
    const formatted = (Number(newBalance) / 1e6).toFixed(2);

    console.log(`[withdraw] Agent ${id} withdrew $${amount} USDC to ${toAddress.slice(0, 10)}... — tx: ${hash.slice(0, 14)}...`);

    return NextResponse.json({
      txHash: hash,
      amount,
      newBalance: formatted,
    });
  } catch (err: any) {
    console.error(`[withdraw] Error withdrawing from agent ${id}:`, err.message);
    return NextResponse.json({ error: err.message || 'Withdraw failed' }, { status: 500 });
  }
}
