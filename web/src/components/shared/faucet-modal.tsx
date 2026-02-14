'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsSignedIn, useEvmAddress } from '@coinbase/cdp-hooks';
import { useWallet } from '@/hooks/use-wallet';
import { useFaucet } from '@/hooks/use-faucet';

export function FaucetModal() {
  const { usdcBalance } = useWallet();
  const { isSignedIn } = useIsSignedIn();
  const { evmAddress } = useEvmAddress();
  const faucet = useFaucet();
  const [dismissed, setDismissed] = useState(false);
  const [claimed, setClaimed] = useState(false);

  // Show if: signed in, has address, balance is 0, not dismissed, not claimed
  const shouldShow = isSignedIn && evmAddress && usdcBalance === '0' && !dismissed && !claimed;

  const handleClaim = async () => {
    if (!evmAddress) return;
    try {
      await faucet.mutateAsync(evmAddress);
      setClaimed(true);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-[380px] mx-4 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-6"
          >
            <div className="text-center mb-5">
              <div className="font-pixel text-[1.3rem] text-[#ededed] tracking-wider mb-2">
                WELCOME TO PIXIE
              </div>
              <p className="text-[12px] text-[#666] font-mono leading-relaxed">
                Your wallet has 0 USDC on SKALE BITE V2.
                <br />
                Claim free tokens to start trading.
              </p>
            </div>

            <div className="rounded-lg border border-[#1a1a1a] p-4 mb-4 space-y-2 text-[12px] font-mono">
              <div className="flex justify-between">
                <span className="text-[#444]">USDC</span>
                <span className="text-[#ededed]">10.00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#444]">sFUEL (gas)</span>
                <span className="text-[#ededed]">0.001</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#444]">chain</span>
                <span className="text-[#ededed]">BITE V2 Sandbox 2</span>
              </div>
            </div>

            {faucet.isSuccess && (
              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 mb-4 text-[11px] font-mono text-green-400">
                Tokens sent! Refresh to see balance.
                {faucet.data?.txHashes?.map((tx: string, i: number) => (
                  <div key={i} className="text-[10px] text-green-500/60 mt-1 truncate">
                    tx: {tx}
                  </div>
                ))}
              </div>
            )}

            {faucet.isError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 mb-4 text-[11px] font-mono text-red-400">
                {(faucet.error as Error).message}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setDismissed(true)}
                className="flex-1 py-2.5 text-[12px] text-[#444] font-mono border border-[#1a1a1a] rounded-lg hover:border-[#333] transition-colors"
              >
                skip
              </button>
              <button
                onClick={handleClaim}
                disabled={faucet.isPending || faucet.isSuccess}
                className="flex-1 py-2.5 text-[13px] font-medium bg-[#ededed] text-[#0a0a0a] rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
              >
                {faucet.isPending ? 'claiming...' : faucet.isSuccess ? 'claimed' : 'claim tokens'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
