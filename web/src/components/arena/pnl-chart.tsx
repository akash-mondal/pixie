'use client';

import { useMemo } from 'react';
import type { PnlSnapshot } from '@/hooks/use-pnl-history';
import { bpsToUsd } from './shared';

// Dynamic import wrapper for SSR safety
import dynamic from 'next/dynamic';

const ChartInner = dynamic(() => Promise.resolve(PnlChartInner), { ssr: false });

interface PnlChartProps {
  snapshots: PnlSnapshot[];
  agentColors: Record<string, string>;
  agentNames: Record<string, string>;
  userAgentId: string;
  isReveal: boolean;
}

export function PnlChart(props: PnlChartProps) {
  if (props.snapshots.length < 2) {
    return (
      <div className="flex-1 min-h-[200px] flex items-center justify-center border-b border-[#1a1a1a]">
        <div className="text-center">
          <div className="text-[11px] font-mono text-[#444] animate-pulse">
            collecting P&L data...
          </div>
          <div className="text-[9px] font-mono text-[#333] mt-1">chart renders after first trade</div>
        </div>
      </div>
    );
  }
  return <ChartInner {...props} />;
}

function PnlChartInner({ snapshots, agentColors, agentNames, userAgentId, isReveal }: PnlChartProps) {
  const {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
    ReferenceLine, CartesianGrid,
  } = require('recharts');

  // Transform snapshots to recharts data format
  const { data, agentIds } = useMemo(() => {
    const ids = new Set<string>();
    for (const snap of snapshots) {
      for (const id of Object.keys(snap.values)) ids.add(id);
    }

    const d = snapshots.map(snap => {
      const point: Record<string, any> = { elapsed: snap.elapsed };
      for (const id of ids) {
        const val = snap.values[id];
        // During trading: opponents have null P&L, show as 0
        point[id] = val ?? 0;
      }
      return point;
    });

    return { data: d, agentIds: Array.from(ids) };
  }, [snapshots]);

  const formatXAxis = (elapsed: number) => {
    const m = Math.floor(elapsed / 60);
    const s = Math.floor(elapsed % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatYAxis = (bps: number) => {
    return bpsToUsd(bps);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 shadow-xl">
        <div className="text-[11px] font-mono text-[#666] mb-1">{formatXAxis(label)}</div>
        {payload.map((p: any) => {
          const name = agentNames[p.dataKey] || p.dataKey;
          const isUser = p.dataKey === userAgentId;
          return (
            <div key={p.dataKey} className="flex items-center gap-2 text-[12px] font-mono">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              <span className={isUser ? 'text-cyan-300' : 'text-[#ccc]'}>{name}</span>
              <span className={p.value >= 0 ? 'text-green-400' : 'text-red-400'}>
                {bpsToUsd(p.value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-[200px] border-b border-[#1a1a1a] p-2 pr-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis
            dataKey="elapsed"
            tickFormatter={formatXAxis}
            tick={{ fill: '#666', fontSize: 11, fontFamily: 'monospace' }}
            axisLine={{ stroke: '#1a1a1a' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fill: '#666', fontSize: 11, fontFamily: 'monospace' }}
            axisLine={{ stroke: '#1a1a1a' }}
            tickLine={false}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#333" strokeDasharray="4 4" />

          {agentIds.map(id => {
            const isUser = id === userAgentId;
            const color = agentColors[id] || '#888';

            return (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                stroke={color}
                strokeWidth={isUser ? 3 : 2}
                dot={false}
                activeDot={{ r: 4, fill: color, stroke: '#0a0a0a', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
