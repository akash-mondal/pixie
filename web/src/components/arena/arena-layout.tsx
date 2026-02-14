'use client';

// Full-viewport two-panel arena layout
// Left: chart + activity feed | Right: tabbed sidebar | Bottom: leaderboard

import { type ReactNode } from 'react';

interface ArenaLayoutProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  bottomStrip: ReactNode;
}

export function ArenaLayout({ leftPanel, rightPanel, bottomStrip }: ArenaLayoutProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Main two-panel area */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: chart + feed */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-[#1a1a1a]">
          {leftPanel}
        </div>
        {/* Right panel: sidebar tabs */}
        <div className="w-[380px] xl:w-[420px] shrink-0 flex flex-col min-h-0">
          {rightPanel}
        </div>
      </div>
      {/* Bottom ticker */}
      {bottomStrip}
    </div>
  );
}
