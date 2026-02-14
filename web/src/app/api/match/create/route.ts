// POST /api/match/create — Deprecated: use /api/session/create instead

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Use /api/session/create instead' },
    { status: 410 },
  );
}
