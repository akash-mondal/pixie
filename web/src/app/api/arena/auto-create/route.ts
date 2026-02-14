// POST /api/arena/auto-create — No-op (system agents are now generated per-session)

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return POST();
}
