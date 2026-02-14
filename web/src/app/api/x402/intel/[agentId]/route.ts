// GET /api/x402/intel/[agentId] — x402-protected agent intelligence endpoint
// Agents pay $0.01 USDC via x402 to access rival agent market analysis
//
// x402 Protocol Flow (RelAI facilitator on SKALE BITE V2):
//   1. Agent requests GET /api/x402/intel/42
//   2. Server returns 402 Payment Required + payment requirements
//   3. Agent's @relai-fi/x402 client signs EIP-3009 TransferWithAuthorization
//   4. Agent retries with X-PAYMENT header containing signed authorization
//   5. Server sends payment to RelAI facilitator → facilitator settles on-chain
//   6. Server returns intelligence data + settlement tx hash

import { NextRequest, NextResponse } from 'next/server';
import { getIntel } from '@/lib/agent-intel';
import { SKALE_NETWORK, USDC_ADDRESS, INTEL_PRICE_ATOMIC, FACILITATOR_URL } from '@/lib/x402-agent';

const PAY_TO = '0x6F8BA9070E594bbC73E4CE2725133726e774D261'; // server wallet

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;

  // --- Check for x402 payment header ---
  const paymentHeader = req.headers.get('X-PAYMENT') || req.headers.get('PAYMENT-SIGNATURE');

  if (!paymentHeader) {
    // Return 402 Payment Required with x402 v2 payment requirements
    const resourceUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}${req.nextUrl.pathname}`;

    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: resourceUrl,
        description: `AI agent #${agentId} market analysis - real-time trading intelligence`,
        mimeType: 'application/json',
      },
      accepts: [{
        scheme: 'exact',
        network: SKALE_NETWORK,
        amount: INTEL_PRICE_ATOMIC,
        payTo: PAY_TO,
        maxTimeoutSeconds: 300,
        asset: USDC_ADDRESS,
        extra: {
          name: 'USD Coin',
          version: '2',
          decimals: 6,
        },
      }],
      extensions: null,
    };

    console.log(`[x402] 402 Payment Required for agent #${agentId} intel`);

    const encodedPayment = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');

    return NextResponse.json(paymentRequired, {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-REQUIRED': encodedPayment,
      },
    });
  }

  // --- Payment header present — settle via RelAI facilitator ---

  // Decode the payment (base64 JSON)
  let payment: any;
  try {
    const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
    payment = JSON.parse(decoded);
  } catch {
    try {
      payment = JSON.parse(paymentHeader);
    } catch {
      return NextResponse.json(
        { x402Version: 2, error: 'Invalid payment encoding' },
        { status: 402 },
      );
    }
  }

  const payer = payment?.payload?.authorization?.from
    || payment?.payload?.userAddress
    || 'unknown';
  console.log(`[x402] Payment received from ${payer} for agent #${agentId} intel`);

  // --- Settle via RelAI facilitator (real on-chain settlement) ---
  let settlementTxHash = '';
  let settledOnChain = false;

  try {
    const settleRes = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: payment,
        paymentRequirements: {
          scheme: 'exact',
          network: 'skale-bite',
          amount: INTEL_PRICE_ATOMIC,
          asset: USDC_ADDRESS,
          payTo: PAY_TO,
          maxTimeoutSeconds: 300,
        },
      }),
    });

    const result = await settleRes.json();

    if (result.success) {
      settlementTxHash = result.transaction || '';
      settledOnChain = true;
      console.log(`[x402] FACILITATOR SETTLED: ${payer.slice(0, 10)}... ($0.01 USDC) — tx: ${settlementTxHash.slice(0, 14)}...`);
    } else {
      console.warn(`[x402] Facilitator settlement failed: ${result.errorReason || result.error}`);
      // Fall back to manual transferFrom if facilitator fails
      try {
        const { writeServerContract, waitForTx, getServerAddress } = await import('@/lib/server-wallet');
        const serverAddr = getServerAddress();

        if (payer !== 'unknown' && payer.startsWith('0x')) {
          const txHash = await writeServerContract({
            address: USDC_ADDRESS as `0x${string}`,
            abi: [{
              name: 'transferFrom',
              type: 'function' as const,
              stateMutability: 'nonpayable' as const,
              inputs: [
                { name: 'from', type: 'address' },
                { name: 'to', type: 'address' },
                { name: 'amount', type: 'uint256' },
              ],
              outputs: [{ name: '', type: 'bool' }],
            }],
            functionName: 'transferFrom',
            args: [payer as `0x${string}`, serverAddr, BigInt(INTEL_PRICE_ATOMIC)],
            gas: 100000n,
          });
          await waitForTx(txHash);
          settlementTxHash = txHash;
          settledOnChain = true;
          console.log(`[x402] FALLBACK settlement via transferFrom — tx: ${txHash.slice(0, 14)}...`);
        }
      } catch (fallbackErr: any) {
        console.error(`[x402] Fallback settlement also failed:`, fallbackErr.message);
      }
    }
  } catch (err: any) {
    console.error(`[x402] Facilitator error:`, err.message);
  }

  // --- Serve the intelligence ---

  const intel = getIntel(agentId);
  if (!intel) {
    return NextResponse.json(
      { error: `No analysis available from agent #${agentId}` },
      { status: 404 },
    );
  }

  // x402 response header (settlement receipt)
  const paymentResponse = {
    x402Version: 2,
    scheme: 'exact',
    network: SKALE_NETWORK,
    transaction: settlementTxHash || `x402-intel-${agentId}-${Date.now()}`,
    payer,
    amount: INTEL_PRICE_ATOMIC,
    asset: USDC_ADDRESS,
  };

  const responseHeaders = new Headers();
  responseHeaders.set('Content-Type', 'application/json');
  responseHeaders.set('PAYMENT-RESPONSE', Buffer.from(JSON.stringify(paymentResponse)).toString('base64'));

  return new NextResponse(JSON.stringify({
    ...intel,
    paidVia: 'x402',
    facilitator: 'relai',
    paymentNetwork: SKALE_NETWORK,
    paymentAmount: '$0.01 USDC',
    payer,
    settlementTxHash: settlementTxHash || undefined,
    settledOnChain,
  }), {
    status: 200,
    headers: responseHeaders,
  });
}
