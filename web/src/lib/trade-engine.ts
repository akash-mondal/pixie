// Trade Engine — BITE-encrypted trade execution on Algebra Finance

import { encodeAbiParameters, type Address } from 'viem';
import { buildSwapCalldata, ALGEBRA_SWAP_ROUTER, TOKENS, PAIRS, type SwapParams } from './algebra';

const RPC_URL = 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2';

let biteInstance: any = null;

async function getBite() {
  if (!biteInstance) {
    const bite = await import('@skalenetwork/bite');
    const Cls = (bite as any).BITE || (bite as any).default?.BITE || (bite as any).default;
    biteInstance = new Cls(RPC_URL);
  }
  return biteInstance;
}

// --- BITE encrypt a message (arbitrary data) ---

export async function encryptMessage(data: string): Promise<string> {
  const bite = await getBite();
  const hexData = data.startsWith('0x') ? data.slice(2) : data;
  const result = await bite.encryptMessage(hexData);
  // Normalize — BITE SDK may return Uint8Array, Buffer, or string
  if (typeof result === 'string') return result;
  if (result instanceof Uint8Array) return '0x' + Buffer.from(result).toString('hex');
  return String(result);
}

// --- BITE encrypt a transaction (swap calldata → invisible on-chain) ---

export async function encryptSwapTransaction(params: {
  pair: string;
  direction: 'buy' | 'sell';
  amountIn: bigint;
  recipient: Address;
}): Promise<{ encrypted: string; calldata: `0x${string}` }> {
  const pairData = PAIRS[params.pair];
  if (!pairData) throw new Error(`Unknown pair: ${params.pair}`);

  const tokenIn = params.direction === 'buy'
    ? TOKENS[pairData.token0].address
    : TOKENS[pairData.token1].address;
  const tokenOut = params.direction === 'buy'
    ? TOKENS[pairData.token1].address
    : TOKENS[pairData.token0].address;

  const swapParams: SwapParams = {
    tokenIn,
    tokenOut,
    recipient: params.recipient,
    amountIn: params.amountIn,
    amountOutMinimum: 0n, // accept any output for demo
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
  };

  const calldata = buildSwapCalldata(swapParams);

  // BITE encrypt the full transaction
  const bite = await getBite();
  const rawEncrypted = await bite.encryptTransaction({
    to: ALGEBRA_SWAP_ROUTER,
    data: calldata,
  });

  // Ensure encrypted is a hex string (BITE SDK may return various types)
  let encrypted: string;
  if (typeof rawEncrypted === 'string') {
    encrypted = rawEncrypted;
  } else if (rawEncrypted instanceof Uint8Array) {
    encrypted = '0x' + Buffer.from(rawEncrypted).toString('hex');
  } else if (Buffer.isBuffer(rawEncrypted)) {
    encrypted = '0x' + rawEncrypted.toString('hex');
  } else {
    // Object — JSON serialize for storage
    encrypted = '0x' + Buffer.from(JSON.stringify(rawEncrypted), 'utf-8').toString('hex');
  }

  return { encrypted, calldata };
}

// --- Encrypt agent strategy (config → hex → BITE) ---

export async function encryptStrategy(configJson: string): Promise<string> {
  const hex = Buffer.from(configJson, 'utf-8').toString('hex');
  return encryptMessage(hex);
}

// --- Encrypt P&L data ---

export async function encryptPnL(pnlBasisPoints: number): Promise<string> {
  const encoded = encodeAbiParameters(
    [{ type: 'int256' }],
    [BigInt(pnlBasisPoints)],
  );
  return encryptMessage(encoded);
}

// --- Encrypt sealed order (tokenIn, tokenOut, amountIn → abi.encode → BITE) ---

export async function encryptSealedOrder(params: {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
}): Promise<string> {
  const encoded = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }],
    [params.tokenIn, params.tokenOut, params.amountIn],
  );
  return encryptMessage(encoded);
}

// --- Encrypt trade reasoning ---

export async function encryptReasoning(reasoning: string): Promise<string> {
  const hex = Buffer.from(reasoning, 'utf-8').toString('hex');
  return encryptMessage(hex);
}
