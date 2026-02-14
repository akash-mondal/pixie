'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { StoredAgent } from '@/lib/agent-store';
import type { AgentConfig } from '@/lib/agent-builder';

export function useAgents() {
  return useQuery<StoredAgent[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error('Failed to fetch agents');
      return res.json();
    },
    refetchInterval: 5000,
  });
}

export function useRegisterAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: AgentConfig & { owner: string }) => {
      // Single atomic call: BITE encrypt → on-chain IdentityRegistry → cache
      const res = await fetch('/api/agent/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Registration failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}
