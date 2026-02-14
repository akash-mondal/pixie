'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useRef, useCallback } from 'react';
import type { TickEvent } from '@/lib/agent-loop';

// Fetch match by invite code
export function useMatch(code: string | undefined) {
  return useQuery({
    queryKey: ['match', code],
    queryFn: async () => {
      const res = await fetch(`/api/match/${code}`);
      if (!res.ok) throw new Error('Match not found');
      return res.json();
    },
    enabled: !!code,
    refetchInterval: 3000,
  });
}

// Create a new match
export function useCreateMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { timeframe: string }) => {
      const res = await fetch('/api/match/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create match');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

// Join match by invite code
export function useJoinMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { code: string; agentId: string; depositAmount?: number }) => {
      const res = await fetch(`/api/match/${params.code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: params.agentId, depositAmount: params.depositAmount || 10 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to join match');
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['match', vars.code] });
    },
  });
}

// Resolve match
export function useResolveMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/match/${code}/resolve`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to resolve match');
      }
      return res.json();
    },
    onSuccess: (_data, code) => {
      queryClient.invalidateQueries({ queryKey: ['match', code] });
    },
  });
}

// SSE stream hook for match events
export function useMatchStream(code: string | undefined) {
  const [events, setEvents] = useState<TickEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [matchState, setMatchState] = useState<any>(null);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!code) return;
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(`/api/match/${code}/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'init' || data.type === 'state') {
          setMatchState(data);
        } else if (data.type === 'resolved') {
          setMatchState(data);
          setConnected(false);
        } else {
          setEvents(prev => [...prev, data]);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 3s
      setTimeout(() => connect(), 3000);
    };
  }, [code]);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);

  return { events, connected, matchState };
}

// Chat-based agent creation
export function useChatCreateAgent() {
  return useMutation({
    mutationFn: async (params: { prompt: string; template?: string }) => {
      const res = await fetch('/api/agent/chat-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to generate agent');
      }
      return res.json();
    },
  });
}

// List all matches
export function useMatches() {
  return useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const res = await fetch('/api/match/list');
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000,
  });
}
