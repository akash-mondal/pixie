// GET /api/stats — Global PIXIE stats for landing page

import { NextResponse } from 'next/server';
import { getGlobalStats } from '@/lib/arena-lifecycle';
import { getArenaStore } from '@/lib/arena-store';

export async function GET() {
  const stats = getGlobalStats();
  const activeMatches = getArenaStore().getActive().length;

  return NextResponse.json({
    initialized: true,
    ...stats,
    activeMatches,
  });
}
