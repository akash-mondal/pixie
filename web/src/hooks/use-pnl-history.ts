'use client';

import { useState, useCallback, useRef } from 'react';

export interface PnlSnapshot {
  timestamp: number;
  elapsed: number; // seconds since trading started
  values: Record<string, number | null>; // agentId -> pnl bps (null = encrypted)
}

export function usePnlHistory() {
  const [snapshots, setSnapshots] = useState<PnlSnapshot[]>([]);
  const lastAddRef = useRef(0);

  const addSnapshot = useCallback((entries: any[], elapsed: number) => {
    // Throttle: at most one snapshot per second
    const now = Date.now();
    if (now - lastAddRef.current < 1000) return;
    lastAddRef.current = now;

    const values: Record<string, number | null> = {};
    for (const e of entries) {
      values[e.agentId] = e.pnl ?? null;
    }
    setSnapshots(prev => {
      const next = [...prev, { timestamp: now, elapsed, values }];
      // Downsample if too many
      if (next.length > 300) {
        return next.filter((_, i) => i % 2 === 0 || i === next.length - 1);
      }
      return next;
    });
  }, []);

  const reconstructFromReveal = useCallback((entries: any[], tradingStartedAt: number) => {
    const agentTradeMap: Record<string, { timestamp: number; cumulativePnl: number }[]> = {};
    const allTimestamps = new Set<number>([tradingStartedAt]);

    for (const entry of entries) {
      const points = [{ timestamp: tradingStartedAt, cumulativePnl: 0 }];
      if (entry.trades && entry.trades.length > 0) {
        let cumPnl = 0;
        for (const trade of entry.trades) {
          cumPnl += trade.simulatedPnL || 0;
          const ts = trade.timestamp || tradingStartedAt;
          points.push({ timestamp: ts, cumulativePnl: cumPnl });
          allTimestamps.add(ts);
        }
      }
      // Final P&L point
      points.push({ timestamp: Date.now(), cumulativePnl: entry.pnl ?? 0 });
      agentTradeMap[entry.agentId] = points;
    }

    const sortedTimes = Array.from(allTimestamps).sort((a, b) => a - b);
    // Add final point
    sortedTimes.push(Date.now());

    const reconstructed: PnlSnapshot[] = sortedTimes.map(ts => {
      const values: Record<string, number | null> = {};
      for (const entry of entries) {
        const points = agentTradeMap[entry.agentId] || [];
        let lastPnl = 0;
        for (const p of points) {
          if (p.timestamp <= ts) lastPnl = p.cumulativePnl;
          else break;
        }
        values[entry.agentId] = lastPnl;
      }
      return {
        timestamp: ts,
        elapsed: Math.max(0, (ts - tradingStartedAt) / 1000),
        values,
      };
    });

    setSnapshots(reconstructed);
  }, []);

  const reset = useCallback(() => {
    setSnapshots([]);
    lastAddRef.current = 0;
  }, []);

  return { snapshots, addSnapshot, reconstructFromReveal, reset };
}
