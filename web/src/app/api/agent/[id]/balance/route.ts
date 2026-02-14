import { NextResponse } from 'next/server';
import { getAgentWallet } from '@/lib/agent-wallet';
import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { biteSandbox } from '@/lib/chain';

const USDC = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wallet = getAgentWallet(id);
  if (!wallet) return NextResponse.json({ balance: '0', formatted: '$0.00' });

  const pc = createPublicClient({ chain: biteSandbox, transport: http('https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2') });
  const raw = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet.address] });
  const formatted = (Number(raw) / 1e6).toFixed(2);

  return NextResponse.json({ balance: raw.toString(), formatted: `$${formatted}` });
}
