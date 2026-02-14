'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TickEvent } from '@/lib/agent-loop';

export function useArenaStream(arenaId: string | null) {
  const [events, setEvents] = useState<TickEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);

  const connect = useCallback(() => {
    if (!arenaId) return;

    setEvents([]);
    setDone(false);

    const eventSource = new EventSource(`/api/arena/${arenaId}/stream`);

    eventSource.onopen = () => setConnected(true);

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as TickEvent;
        if ((event.type as string) === 'done') {
          setDone(true);
          eventSource.close();
          setConnected(false);
        }
        setEvents(prev => [...prev, event]);
      } catch { /* ignore parse errors */ }
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [arenaId]);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return { events, connected, done };
}
