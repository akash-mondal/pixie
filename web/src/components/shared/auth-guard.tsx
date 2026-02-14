'use client';

import { useIsSignedIn, useIsInitialized } from '@coinbase/cdp-hooks';
import { AuthButton } from '@coinbase/cdp-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useIsSignedIn();
  const { isInitialized } = useIsInitialized();

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="font-pixel text-[2rem] text-[#ededed] tracking-wider mb-4">
            PIXIE.
          </div>
          <p className="text-[13px] text-[#444] font-mono animate-pulse">
            initializing...
          </p>
        </div>
      </div>
    );
  }

  if (isSignedIn) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center">
        <div className="font-pixel text-[2rem] text-[#ededed] tracking-wider mb-4">
          PIXIE.
        </div>
        <p className="text-[13px] text-[#444] font-mono mb-8">
          sign in to continue
        </p>
        <AuthButton />
      </div>
    </div>
  );
}
