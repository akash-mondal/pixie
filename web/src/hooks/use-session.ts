'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useRef, useCallback } from 'react';
import type { TickEvent } from '@/lib/agent-loop';

// Create a new session
export function useCreateSession() {
  return useMutation({
    mutationFn: async (params: { mode: string; agentId: string }) => {
      const res = await fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create session');
      }
      return res.json();
    },
  });
}

// Fetch session state (with censored opponent data)
export function useSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/session/${sessionId}`);
      if (!res.ok) throw new Error('Session not found');
      return res.json();
    },
    enabled: !!sessionId,
    refetchInterval: 2000,
  });
}

// SSE stream for session events (lobby + trading + reveal)
export function useSessionStream(sessionId: string | undefined) {
  const [events, setEvents] = useState<TickEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [matchState, setMatchState] = useState<any>(null);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!sessionId) return;
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(`/api/session/${sessionId}/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'init' || data.type === 'state') {
          setMatchState(data);
        } else if (data.type === 'resolved') {
          setMatchState(data);
          // Don't disconnect yet — let the UI handle it
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
      // Reconnect after 3s if not resolved
      setTimeout(() => {
        if (esRef.current === es) {
          connect();
        }
      }, 3000);
    };
  }, [sessionId]);

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
