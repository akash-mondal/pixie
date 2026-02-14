'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { CDPReactProvider } from '@coinbase/cdp-react';
import { getConfig } from '@/lib/wagmi';
import { FaucetModal } from '@/components/shared/faucet-modal';
import { useState, useEffect, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5000, retry: 1 } } }),
  );

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const config = getConfig();

  return (
    <CDPReactProvider config={{
      projectId: process.env.NEXT_PUBLIC_CDP_PROJECT_ID!,
      ethereum: { createOnLogin: 'eoa' },
    }}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <FaucetModal />
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </CDPReactProvider>
  );
}
