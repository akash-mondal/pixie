'use client';

// ═══════════════════════════════════════════════════════════
// SHARED ARENA UTILITIES — constants, icons, explorer links
// ═══════════════════════════════════════════════════════════

export const EXPLORER_BASE = 'https://base-sepolia-testnet-explorer.skalenodes.com:10032/tx';
export const EXPLORER_ADDR = 'https://base-sepolia-testnet-explorer.skalenodes.com:10032/address';

export const AVATAR_URL = (name: string) =>
  `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(name)}&size=80&backgroundColor=0a0a0a`;

export const STEP_LABELS: Record<string, string> = {
  pending: 'waiting...',
  wallet: 'create agent wallet',
  sfuel: 'fund gas (sFUEL)',
  usdc: 'deposit USDC balance',
  identity: 'register on-chain ID (ERC-8004)',
  encrypt: 'encrypt strategy (BITE)',
  join: 'join arena on-chain',
  ready: 'READY',
};

// Short labels for completed steps (used when not current)
export const STEP_LABELS_SHORT: Record<string, string> = {
  pending: 'waiting...',
  wallet: 'wallet created',
  sfuel: 'gas funded',
  usdc: 'USDC deposited',
  identity: 'identity registered',
  encrypt: 'strategy encrypted',
  join: 'joined arena',
  ready: 'READY',
};

export const STEP_ORDER = ['pending', 'wallet', 'sfuel', 'usdc', 'identity', 'encrypt', 'join', 'ready'];

export function stepProgress(step: string): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx >= 0 ? (idx / (STEP_ORDER.length - 1)) * 100 : 0;
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function relativeTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m`;
}

export function truncateHash(hash: string, start = 6, end = 4): string {
  if (!hash) return '';
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
}

// ── Explorer Link ──
export function ExplorerLink({ hash, label, failed }: { hash?: string; label?: string; failed?: boolean }) {
  if (!hash) return null;
  return (
    <a
      href={`${EXPLORER_BASE}/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-[11px] font-mono transition-colors ${
        failed
          ? 'text-red-400/60 hover:text-red-400'
          : 'text-cyan-400/60 hover:text-cyan-400'
      }`}
      title={hash}
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="shrink-0">
        <path d="M4.5 2H3a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1V7.5M7 2h3m0 0v3m0-3L5.5 6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {label || truncateHash(hash)}
    </a>
  );
}

// ── Lock Icon ──
export function LockIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor" className="text-yellow-500/50 shrink-0">
      <rect x="2" y="4" width="6" height="4.5" rx="1" />
      <path d="M3 4V3a2 2 0 014 0v1" stroke="currentColor" fill="none" strokeWidth="0.8" />
    </svg>
  );
}

// ── Cipher text for encrypted opponent data ──
export function CipherText({ length = 32 }: { length?: number }) {
  const hex = Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return (
    <span className="text-[9px] font-mono text-yellow-500/25 tracking-wider break-all select-none">
      0x{hex}
    </span>
  );
}

// ── BPS → USD/Percent conversion ──
const STARTING_USD = 0.50; // agents start with $0.50 USDC

export function bpsToUsd(bps: number): string {
  const usd = (bps / 10000) * STARTING_USD;
  const abs = Math.abs(usd);
  const sign = usd > 0 ? '+' : usd < 0 ? '-' : '';
  if (abs === 0) return '$0.00';
  if (abs >= 0.01) return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.001) return `${sign}$${abs.toFixed(3)}`;
  return `${sign}$${abs.toFixed(4)}`;
}

export function bpsToPercent(bps: number): string {
  const pct = bps / 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

// ── Direction Arrow ──
export function DirectionArrow({ direction }: { direction: 'buy' | 'sell' }) {
  return (
    <span className={`text-[12px] font-mono font-bold ${direction === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
      {direction === 'buy' ? '\u2191' : '\u2193'}
    </span>
  );
}

// ── Agent Dot ──
export function AgentDot({ color, size = 6 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
    />
  );
}
