'use client';

import { useState, useEffect } from 'react';

interface MarketData {
  pair: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  tickMovement: number;
}

function formatPrice(pair: string, price: number): string {
  if (pair === 'ETH/WBTC') return price.toFixed(5);
  if (pair === 'WBTC/USDC') return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(vol: number): string {
  if (vol >= 1e9) return `$${(vol / 1e9).toFixed(1)}B`;
  if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3) return `$${(vol / 1e3).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

export function MarketStrip() {
  const [markets, setMarkets] = useState<MarketData[]>([]);

  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        const res = await fetch('/api/market-data');
        if (res.ok) {
          const data = await res.json();
          setMarkets(data.markets || []);
        }
      } catch {
        // silent — will retry on next interval
      }
    };

    fetchMarkets();
    const interval = setInterval(fetchMarkets, 30000);
    return () => clearInterval(interval);
  }, []);

  if (markets.length === 0) return null;

  return (
    <div className="flex gap-0 border-b border-[#1a1a1a] bg-[#0a0a0a] shrink-0">
      {markets.map((m) => {
        const isUp = m.priceChange24h >= 0;
        const changeColor = isUp ? 'text-green-400' : 'text-red-400';
        const dotColor = m.tickMovement > 0 ? 'bg-green-400' : m.tickMovement < 0 ? 'bg-red-400' : 'bg-[#555]';

        return (
          <div key={m.pair} className="flex-1 flex items-center gap-3 px-4 py-2.5 border-r border-[#1a1a1a] last:border-r-0">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse`} />
              <span className="text-[13px] font-mono text-[#888]">{m.pair}</span>
            </div>
            <span className="text-[16px] font-mono font-semibold text-[#ededed]">
              ${formatPrice(m.pair, m.price)}
            </span>
            <span className={`text-[13px] font-mono ${changeColor}`}>
              {isUp ? '+' : ''}{m.priceChange24h.toFixed(1)}%
            </span>
            <span className="text-[12px] font-mono text-[#555]">
              vol {formatVolume(m.volume24h)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
