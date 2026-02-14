'use client';

import { useMutation } from '@tanstack/react-query';

export function useFaucet() {
  return useMutation({
    mutationFn: async (address: string) => {
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Faucet failed');
      return data;
    },
  });
}
