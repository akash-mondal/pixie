'use client';

export const dynamic = 'force-dynamic';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { AuthGuard } from '@/components/shared/auth-guard';
import { useSession, useSessionStream } from '@/hooks/use-session';
import { usePnlHistory } from '@/hooks/use-pnl-history';

// Arena components
import { TopBar } from '@/components/arena/top-bar';
import { ArenaLayout } from '@/components/arena/arena-layout';
import { PnlChart } from '@/components/arena/pnl-chart';
import { ActivityFeed } from '@/components/arena/activity-feed';
import { SidebarTabs } from '@/components/arena/sidebar-tabs';
import { LeaderboardStrip } from '@/components/arena/leaderboard-strip';
import { LobbyView } from '@/components/arena/lobby-view';
import { ResultsScreen } from '@/components/arena/results-screen';
import { MarketStrip } from '@/components/arena/market-strip';

export default function SessionMatchPage() {
  return (
    <AuthGuard>
      <SessionMatchInner />
    </AuthGuard>
  );
}

function SessionMatchInner() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.code as string;
  const { data: session } = useSession(sessionId);
  const { events, connected, matchState } = useSessionStream(sessionId);
  const pnlHistory = usePnlHistory();
  const tradingStartRef = useRef<number>(0);

  const phase = matchState?.phase || session?.phase || 'lobby';
  const isReveal = phase === 'reveal' || session?.resolved;
  const userAgentId = matchState?.userAgentId || session?.userAgentId;
  const deadline = matchState?.deadline || session?.deadline || 0;

  // Merge SSE + REST data
  const lobbyAgents: any[] = useMemo(() => {
    const rest = session?.lobbyAgents || [];
    const sse = matchState?.lobbyAgents || [];
    if (sse.length === 0) return rest;
    return rest.map((r: any) => {
      const s = sse.find((s: any) => s.agentId === r.agentId);
      return s ? { ...r, ...s } : r;
    });
  }, [session?.lobbyAgents, matchState?.lobbyAgents]);

  const entries: any[] = useMemo(() => {
    const rest = session?.entries || [];
    const sse = matchState?.entries || [];
    if (sse.length === 0) return rest;
    return rest.map((r: any) => {
      const s = sse.find((s: any) => s.agentId === r.agentId);
      return s ? { ...r, ...s } : r;
    });
  }, [session?.entries, matchState?.entries]);

  const stats = matchState?.stats || session?.stats || {};

  // Build agent color/name maps for chart
  const agentColors = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of lobbyAgents) m[a.agentId] = a.accentColor || '#888';
    return m;
  }, [lobbyAgents]);

  const agentNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of lobbyAgents) m[a.agentId] = a.agentName;
    return m;
  }, [lobbyAgents]);

  // Track trading start time
  useEffect(() => {
    if (phase === 'trading' && tradingStartRef.current === 0) {
      tradingStartRef.current = Date.now();
    }
  }, [phase]);

  // Feed P&L snapshots during trading
  useEffect(() => {
    if (phase === 'trading' && entries.length > 0 && tradingStartRef.current > 0) {
      const elapsed = (Date.now() - tradingStartRef.current) / 1000;
      pnlHistory.addSnapshot(entries, elapsed);
    }
  }, [phase, entries, pnlHistory]);

  // Reconstruct full P&L history on reveal — re-runs only when trade count changes
  const lastTradeCountRef = useRef(0);
  useEffect(() => {
    if (isReveal && entries.length > 0) {
      const totalTrades = entries.reduce((sum: number, e: any) => sum + (e.trades?.length || 0), 0);
      if (totalTrades > 0 && totalTrades !== lastTradeCountRef.current) {
        lastTradeCountRef.current = totalTrades;
        const startAt = tradingStartRef.current || (session?.phaseStartedAt || Date.now() - 120000);
        pnlHistory.reconstructFromReveal(entries, startAt);
      }
    }
  }, [isReveal, entries, session?.phaseStartedAt, pnlHistory]);

  // Loading state
  if (!session && !matchState) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <main className="max-w-[800px] mx-auto px-6 pt-32 text-center">
          <div className="font-pixel text-[18px] text-[#555] tracking-wider animate-pulse">
            CONNECTING...
          </div>
          <div className="text-[12px] font-mono text-[#444] mt-2">{sessionId}</div>
        </main>
      </div>
    );
  }

  // Results screen
  if (isReveal) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <ResultsScreen
          session={session}
          entries={entries}
          lobbyAgents={lobbyAgents}
          stats={stats}
          events={events}
          userAgentId={userAgentId}
          pnlSnapshots={pnlHistory.snapshots}
          agentColors={agentColors}
          agentNames={agentNames}
          onExit={() => router.push('/play')}
        />
      </div>
    );
  }

  // Lobby or Trading — full viewport layout
  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] overflow-hidden">
      <TopBar
        phase={phase}
        mode={session?.mode}
        connected={connected}
        stats={stats}
        deadline={deadline}
        onChainId={session?.onChainId}
        resolved={!!session?.resolved}
      />

      {phase === 'lobby' ? (
        <LobbyView
          lobbyAgents={lobbyAgents}
          userAgentId={userAgentId}
          events={events}
          stats={stats}
        />
      ) : (
        <ArenaLayout
          leftPanel={
            <>
              <MarketStrip />
              <PnlChart
                snapshots={pnlHistory.snapshots}
                agentColors={agentColors}
                agentNames={agentNames}
                userAgentId={userAgentId}
                isReveal={false}
              />
              <ActivityFeed
                events={events}
                lobbyAgents={lobbyAgents}
                userAgentId={userAgentId}
              />
            </>
          }
          rightPanel={
            <SidebarTabs
              entries={entries}
              events={events}
              lobbyAgents={lobbyAgents}
              userAgentId={userAgentId}
              phase={phase}
              stats={stats as any}
            />
          }
          bottomStrip={
            <LeaderboardStrip
              entries={entries}
              userAgentId={userAgentId}
              isReveal={false}
            />
          }
        />
      )}
    </div>
  );
}
