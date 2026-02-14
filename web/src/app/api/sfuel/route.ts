// POST /api/sfuel — Auto-send sFUEL to new users on sign-up
// Called automatically when a CDP wallet connects for the first time

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, type Address } from 'viem';
import { getServerWalletClient } from '@/lib/server-wallet';
import { biteSandbox } from '@/lib/chain';

const RPC_URL = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const MIN_SFUEL = 500000000000000n; // 0.0005 sFUEL
const SFUEL_AMOUNT = 1000000000000000n; // 0.001 sFUEL

// Track funded addresses (globalThis for HMR persistence)
const g = globalThis as any;
function getFundedSet(): Set<string> {
  if (!g.__pixieSfuelFunded) g.__pixieSfuelFunded = new Set<string>();
  return g.__pixieSfuelFunded;
}

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();

    if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const funded = getFundedSet();
    const normalized = address.toLowerCase();

    // Skip if already funded this session
    if (funded.has(normalized)) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const pc = createPublicClient({ chain: biteSandbox, transport: http(RPC_URL) });
    const balance = await pc.getBalance({ address: address as Address });

    // Skip if already has enough sFUEL
    if (balance >= MIN_SFUEL) {
      funded.add(normalized);
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Send sFUEL from server wallet
    const serverWc = getServerWalletClient();
    const hash = await serverWc.sendTransaction({
      to: address as Address,
      value: SFUEL_AMOUNT,
      gas: 21000n,
      type: 'legacy' as any,
    } as any);

    await pc.waitForTransactionReceipt({ hash });
    funded.add(normalized);

    console.log(`[sfuel] Auto-funded ${address.slice(0, 10)}... with 0.001 sFUEL — tx: ${hash.slice(0, 14)}...`);

    return NextResponse.json({ ok: true, txHash: hash });
  } catch (err: any) {
    console.error('[sfuel] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
