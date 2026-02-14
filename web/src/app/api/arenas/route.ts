// GET /api/arenas — List arenas (from in-memory store for hackathon)

import { NextResponse } from 'next/server';
import { getArenaStore } from '@/lib/arena-store';

export async function GET() {
  const arenas = getArenaStore().getAll();
  return NextResponse.json(arenas);
}
