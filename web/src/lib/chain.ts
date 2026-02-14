import { defineChain } from 'viem';

export const biteSandbox = defineChain({
  id: 103698795,
  name: 'BITE V2 Sandbox 2',
  nativeCurrency: { decimals: 18, name: 'sFUEL', symbol: 'sFUEL' },
  rpcUrls: {
    default: {
      http: ['https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2'],
    },
  },
  blockExplorers: {
    default: {
      name: 'SKALE Explorer',
      url: 'https://bite-v2-sandbox-2.explorer.skalenodes.com',
    },
  },
});
