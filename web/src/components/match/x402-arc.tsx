'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface X402ArcData {
  id: string;
  fromIndex: number;
  toIndex: number;
  price: string;
  direction?: string;
  timestamp: number;
}

interface X402ArcProps {
  arcs: X402ArcData[];
  gridPositions: Array<{ x: number; y: number }>;
  onComplete: (id: string) => void;
}

export function X402ArcLayer({ arcs, gridPositions, onComplete }: X402ArcProps) {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      <AnimatePresence>
        {arcs.map(arc => {
          const from = gridPositions[arc.fromIndex];
          const to = gridPositions[arc.toIndex];
          if (!from || !to) return null;

          return (
            <X402Arc
              key={arc.id}
              from={from}
              to={to}
              price={arc.price}
              direction={arc.direction}
              onComplete={() => onComplete(arc.id)}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function X402Arc({
  from,
  to,
  price,
  direction,
  onComplete,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  price: string;
  direction?: string;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame: number;
    let start: number;
    const duration = 1500;

    const tick = (now: number) => {
      if (!start) start = now;
      const elapsed = now - start;
      const p = Math.min(1, elapsed / duration);
      setProgress(p);
      if (p < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setTimeout(onComplete, 500);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [onComplete]);

  // Interpolate position
  const cx = from.x + (to.x - from.x) * progress;
  const cy = from.y + (to.y - from.y) * progress;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0"
    >
      {/* Line trail */}
      <svg className="absolute inset-0 w-full h-full">
        <line
          x1={from.x}
          y1={from.y}
          x2={cx}
          y2={cy}
          stroke="#10b981"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity={0.4}
        />
      </svg>

      {/* Floating price badge */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40"
        style={{ left: cx, top: cy }}
      >
        <span className="text-[12px] font-mono text-emerald-400 font-medium">{price}</span>
        {direction && (
          <span className={`text-[11px] ${direction === 'bullish' ? 'text-green-400' : direction === 'bearish' ? 'text-red-400' : 'text-[#888]'}`}>
            {direction === 'bullish' ? '\u2191' : direction === 'bearish' ? '\u2193' : '\u2022'}
          </span>
        )}
      </div>
    </motion.div>
  );
}
