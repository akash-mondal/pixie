// BITE client — encrypt/decrypt LP strategies using BITE v2 threshold encryption

import { ethers } from 'ethers';

let biteInstance: any = null;

async function getBite(rpcUrl: string) {
  if (!biteInstance) {
    const bite = await import('@skalenetwork/bite');
    const Cls = (bite as any).BITE || (bite as any).default?.BITE || (bite as any).default;
    biteInstance = new Cls(rpcUrl);
  }
  return biteInstance;
}

export interface LPStrategy {
  tickLower: number;
  tickUpper: number;
  lockDays: number;
}

/// Encode an LP strategy as ABI-encoded bytes (matches Solidity decode)
export function encodeStrategy(strategy: LPStrategy): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return coder.encode(
    ['int24', 'int24', 'uint256'],
    [strategy.tickLower, strategy.tickUpper, strategy.lockDays],
  );
}

/// Decrypt and decode a revealed strategy
export function decodeStrategy(data: string): LPStrategy {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const [tickLower, tickUpper, lockDays] = coder.decode(
    ['int24', 'int24', 'uint256'],
    data,
  );
  return {
    tickLower: Number(tickLower),
    tickUpper: Number(tickUpper),
    lockDays: Number(lockDays),
  };
}

/// Encrypt an LP strategy using BITE threshold encryption
export async function encryptStrategy(
  rpcUrl: string,
  strategy: LPStrategy,
): Promise<string> {
  const bite = await getBite(rpcUrl);
  const encoded = encodeStrategy(strategy);
  // encryptMessage takes hex string (with or without 0x)
  const hexData = encoded.startsWith('0x') ? encoded.slice(2) : encoded;
  const encrypted = await bite.encryptMessage(hexData);
  return encrypted;
}

/// Send an encrypted transaction (strategy commitment)
export async function commitEncryptedStrategy(
  rpcUrl: string,
  signer: ethers.Wallet,
  strategy: LPStrategy,
): Promise<{ txHash: string; encrypted: string; sendTime: number; receiptTime: number }> {
  const bite = await getBite(rpcUrl);
  const encoded = encodeStrategy(strategy);
  const hexData = encoded.startsWith('0x') ? encoded : '0x' + encoded;

  const encryptedTx = await bite.encryptTransaction({
    to: signer.address,
    data: hexData,
    value: '0x0',
    gasLimit: '0x493e0', // 300000
  });

  const sendTime = Date.now();
  const tx = await signer.sendTransaction({ ...encryptedTx, type: 0 } as any);
  const receipt = await tx.wait();
  const receiptTime = Date.now();

  if (!receipt || receipt.status !== 1) {
    throw new Error(`BITE commit failed (status=${receipt?.status})`);
  }

  return { txHash: tx.hash, encrypted: hexData, sendTime, receiptTime };
}

/// Wait for BITE decryption of a committed strategy
export async function decryptCommitment(
  rpcUrl: string,
  txHash: string,
  timeoutMs = 30000,
): Promise<string> {
  const bite = await getBite(rpcUrl);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await bite.getDecryptedTransactionData(txHash);
      const data = (result as any).data ?? (result as any).Data ?? result;
      return typeof data === 'string' ? data : String(data);
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error(`BITE decrypt timeout after ${timeoutMs}ms for ${txHash}`);
}
