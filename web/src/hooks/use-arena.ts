'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { StoredArena } from '@/lib/arena-store';

export function useArenas() {
  return useQuery<StoredArena[]>({
    queryKey: ['arenas'],
    queryFn: async () => {
      const res = await fetch('/api/arenas');
      if (!res.ok) throw new Error('Failed to fetch arenas');
      return res.json();
    },
    refetchInterval: 5000,
  });
}

export function useArena(arenaId: string | null) {
  return useQuery<StoredArena>({
    queryKey: ['arena', arenaId],
    queryFn: async () => {
      const res = await fetch('/api/arenas');
      if (!res.ok) throw new Error('Failed to fetch arenas');
      const arenas: StoredArena[] = await res.json();
      const arena = arenas.find(a => a.id === arenaId);
      if (!arena) throw new Error('Arena not found');
      return arena;
    },
    enabled: !!arenaId,
    refetchInterval: 3000,
  });
}

export function useCreateArena() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { creator: string; entryFee: number; prizePool: number; maxAgents: number; duration: number }) => {
      const res = await fetch('/api/arena/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to create arena');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arenas'] });
    },
  });
}

export function useJoinArena() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { arenaId: string; agentId: string; walletAddress: string; depositAmount: number }) => {
      const res = await fetch('/api/arena/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to join arena');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arenas'] });
    },
  });
}

export function useResolveArena() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (arenaId: string) => {
      const res = await fetch(`/api/arena/${arenaId}/resolve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to resolve arena');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arenas'] });
    },
  });
}
