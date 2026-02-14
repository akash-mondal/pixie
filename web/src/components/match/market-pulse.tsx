'use client';

export interface TradeMarker {
  timestamp: number;
  agentId: string;
  agentColor: string;
  direction: 'buy' | 'sell';
}

interface MarketPulseProps {
  markets: Record<string, { price: number; change: number }>;
}

export function MarketPulse({ markets }: MarketPulseProps) {
  const pairs = Object.entries(markets);

  return (
    <div className="flex items-center gap-6 py-3 border-b border-[#1a1a1a] min-h-[44px]">
      {pairs.map(([pair, data]) => (
        <div key={pair} className="flex items-center gap-2">
          <span className="text-[13px] font-mono text-[#555]">{pair}</span>
          <span className="text-[15px] font-mono text-[#ededed] font-medium tabular-nums">
            ${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={`text-[13px] font-mono font-medium ${data.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {data.change >= 0 ? '\u2191' : '\u2193'}{Math.abs(data.change).toFixed(1)}%
          </span>
        </div>
      ))}
      {pairs.length === 0 && (
        <span className="text-[13px] font-mono text-[#333] animate-pulse">fetching market data...</span>
      )}
    </div>
  );
}
