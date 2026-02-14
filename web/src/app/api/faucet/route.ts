// POST /api/faucet — Claim USDC + sFUEL for new users (rate-limited)

import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http, parseAbi, type Address } from 'viem';
import { getServerAccount } from '@/lib/server-wallet';
import { biteSandbox } from '@/lib/chain';

const RPC_URL = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';
const USDC_ADDRESS = '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8' as Address;
const FAUCET_USDC = 10; // 10 USDC per claim
const FAUCET_SFUEL = 0.001; // sFUEL for gas

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) external returns (bool)',
]);

// Rate limit: 1 claim per address (globalThis for HMR persistence)
const g = globalThis as any;
function getClaimedAddresses(): Set<string> {
  if (!g.__pixieFaucetClaimed) g.__pixieFaucetClaimed = new Set<string>();
  return g.__pixieFaucetClaimed;
}

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();

    if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const claimed = getClaimedAddresses();
    const normalized = address.toLowerCase();

    if (claimed.has(normalized)) {
      return NextResponse.json({ error: 'Already claimed. One claim per address.' }, { status: 429 });
    }

    const serverAccount = getServerAccount();
    const walletClient = createWalletClient({
      account: serverAccount,
      chain: biteSandbox,
      transport: http(RPC_URL),
    });

    const txHashes: string[] = [];

    // 1. Send USDC
    const usdcAmount = BigInt(FAUCET_USDC * 1e6);
    const usdcHash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [address as Address, usdcAmount],
      gas: 100000n,
      type: 'legacy' as any,
    } as any);
    txHashes.push(usdcHash);

    // 2. Send sFUEL (native token for gas)
    try {
      const sfuelHash = await walletClient.sendTransaction({
        to: address as Address,
        value: BigInt(Math.round(FAUCET_SFUEL * 1e18)),
        gas: 21000n,
        type: 'legacy' as any,
      } as any);
      txHashes.push(sfuelHash);
    } catch (err: any) {
      console.error('[faucet] sFUEL transfer failed:', err.message);
      // Non-blocking — USDC is the important part
    }

    claimed.add(normalized);

    console.log(`[faucet] Funded ${address} with ${FAUCET_USDC} USDC + ${FAUCET_SFUEL} sFUEL`);

    return NextResponse.json({
      success: true,
      address,
      usdc: FAUCET_USDC,
      sfuel: FAUCET_SFUEL,
      txHashes,
    });
  } catch (err: any) {
    console.error('[faucet] Error:', err);
    return NextResponse.json({ error: err.message || 'Faucet failed' }, { status: 500 });
  }
}
