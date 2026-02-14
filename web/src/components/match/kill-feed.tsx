'use client';

export interface KillFeedItem {
  id: string;
  agentName: string;
  action: 'buy' | 'sell' | 'hold' | 'x402' | 'clash' | 'encrypt';
  detail: string;
  color: string;
  timestamp: number;
}

const ACTION_COLORS: Record<string, string> = {
  buy: '#22c55e',
  sell: '#ef4444',
  hold: '#666',
  x402: '#10b981',
  clash: '#f59e0b',
  encrypt: '#eab308',
};

const ACTION_ICONS: Record<string, string> = {
  buy: '\u2191',   // up
  sell: '\u2193',   // down
  hold: '\u2014',   // dash
  x402: '$',
  clash: '\u2694',  // swords
  encrypt: '~',
};

// Filter out noise from kill feed
const FEED_BLOCKLIST = ['max trades', 'round reached', 'stopped trading'];
function shouldShowInFeed(detail: string): boolean {
  const lower = detail.toLowerCase();
  return !FEED_BLOCKLIST.some(b => lower.includes(b));
}

interface KillFeedProps {
  items: KillFeedItem[];
}

export function KillFeed({ items }: KillFeedProps) {
  const filtered = items.filter(item => shouldShowInFeed(item.detail));
  const visible = filtered.slice(-8).reverse();

  return (
    <div>
      <div className="text-[12px] font-mono text-[#444] tracking-widest mb-3">FEED</div>
      {/* Fixed-height container — no layout shifts */}
      <div className="h-[260px] overflow-hidden">
        {visible.map((item) => (
          <div
            key={item.id}
            className="font-mono text-[13px] leading-relaxed py-1.5 border-b border-[#1a1a1a]/30 last:border-0"
          >
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0" style={{ color: ACTION_COLORS[item.action] || '#666' }}>
                {ACTION_ICONS[item.action] || '>'}
              </span>
              <span className="flex-shrink-0 font-medium" style={{ color: item.color }}>
                {item.agentName}
              </span>
              <span className="text-[#555] truncate min-w-0">{item.detail}</span>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="text-[13px] font-mono text-[#333]">waiting for agents...</div>
        )}
      </div>
    </div>
  );
}
