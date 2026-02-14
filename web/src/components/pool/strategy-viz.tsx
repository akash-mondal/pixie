'use client';

import type { Deposit } from '@/hooks/use-pools';

const COLORS = ['#22c55e', '#eab308', '#ededed', '#6b6b6b', '#444'];
const CURRENT_TICK = 200340;

export function StrategyViz({ deposits }: { deposits: Deposit[] }) {
  const revealed = deposits.filter((d) => d.revealed);

  if (revealed.length === 0) {
    return (
      <div className="surface rounded-lg p-5">
        <div className="text-[11px] text-[#444] font-mono mb-4">strategy ranges</div>
        <div className="h-24 flex items-center justify-center">
          <p className="text-[12px] text-[#444] font-mono">encrypted — resolve to reveal</p>
        </div>
      </div>
    );
  }

  const allTicks = revealed.flatMap((d) => [d.tickLower, d.tickUpper]);
  const minTick = Math.min(...allTicks, CURRENT_TICK) - 1000;
  const maxTick = Math.max(...allTicks, CURRENT_TICK) + 1000;
  const range = maxTick - minTick;

  const toPercent = (tick: number) => ((tick - minTick) / range) * 100;

  return (
    <div className="surface rounded-lg p-5">
      <div className="text-[11px] text-[#444] font-mono mb-4">strategy ranges</div>
      <div className="relative h-40">
        {/* Current price line */}
        <div
          className="absolute top-0 bottom-6 w-px bg-[#333]"
          style={{ left: `${toPercent(CURRENT_TICK)}%` }}
        >
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-[#444] font-mono whitespace-nowrap">
            current
          </div>
        </div>

        {/* Deposit bars */}
        {revealed.map((d, i) => {
          const left = toPercent(d.tickLower);
          const width = toPercent(d.tickUpper) - left;
          const top = 4 + i * 28;
          const color = COLORS[i % COLORS.length];

          return (
            <div
              key={d.index}
              className="absolute h-5 rounded-sm transition-all"
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.5)}%`,
                top: `${top}px`,
                backgroundColor: `${color}15`,
                borderLeft: `2px solid ${color}`,
              }}
            >
              <span
                className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono whitespace-nowrap"
                style={{ color }}
              >
                #{d.index} · ${d.amount} · {d.lockDays}d
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
