// POST /api/agent/[id]/fund — Fund agent wallet with USDC from server wallet
import { NextRequest, NextResponse } from 'next/server';
import { getAgentWallet, fundAgentSfuel } from '@/lib/agent-wallet';
import { getServerWalletClient, getServerPublicClient, getServerAddress } from '@/lib/server-wallet';
import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { biteSandbox } from '@/lib/chain';
import { getAgentStore } from '@/lib/agent-store';

const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { amount, markOnly } = body;

  const wallet = getAgentWallet(id);
  if (!wallet) {
    return NextResponse.json({ error: 'Agent wallet not found' }, { status: 404 });
  }

  const pc = getServerPublicClient();

  // markOnly: user already sent USDC from their wallet — just ensure sFUEL + mark funded
  if (markOnly) {
    try {
      await fundAgentSfuel(id).catch(() => {});
      const agent = getAgentStore().get(id);
      if (agent) agent.funded = true;

      const newBalance = await pc.readContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [wallet.address],
      }) as bigint;
      const formatted = (Number(newBalance) / 1e6).toFixed(2);

      console.log(`[fund] Marked agent ${id} as funded (user wallet transfer) — balance: $${formatted}`);
      return NextResponse.json({ newBalance: formatted });
    } catch (err: any) {
      console.error(`[fund] Error marking agent ${id}:`, err.message);
      return NextResponse.json({ error: err.message || 'Mark funded failed' }, { status: 500 });
    }
  }

  // Server-funded flow (fallback)
  if (!amount || amount <= 0 || amount > 100) {
    return NextResponse.json({ error: 'Amount must be between 0.01 and 100 USDC' }, { status: 400 });
  }

  try {
    const amountAtomic = BigInt(Math.round(amount * 1e6));
    const walletClient = getServerWalletClient();

    // Check server has enough USDC
    const serverBalance = await pc.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [getServerAddress()],
    }) as bigint;

    if (serverBalance < amountAtomic) {
      return NextResponse.json({ error: 'Insufficient server USDC balance' }, { status: 400 });
    }

    // Ensure agent has sFUEL
    await fundAgentSfuel(id).catch(() => {});

    // Transfer USDC to agent
    const hash = await walletClient.writeContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [wallet.address, amountAtomic],
      gas: 100000n,
      type: 'legacy' as any,
    } as any);

    await pc.waitForTransactionReceipt({ hash });

    // Update funded status
    const agent = getAgentStore().get(id);
    if (agent) agent.funded = true;

    // Read new balance
    const newBalance = await pc.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [wallet.address],
    }) as bigint;
    const formatted = (Number(newBalance) / 1e6).toFixed(2);

    console.log(`[fund] Funded agent ${id} with $${amount} USDC — tx: ${hash.slice(0, 14)}...`);

    return NextResponse.json({
      txHash: hash,
      amount,
      newBalance: formatted,
    });
  } catch (err: any) {
    console.error(`[fund] Error funding agent ${id}:`, err.message);
    return NextResponse.json({ error: err.message || 'Fund failed' }, { status: 500 });
  }
}
