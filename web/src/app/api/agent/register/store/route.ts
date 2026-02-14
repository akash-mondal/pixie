// POST /api/agent/register/store — Legacy endpoint (no longer needed)
// Registration is now atomic in /api/agent/register (BITE + on-chain + cache)

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // Return success for backward compatibility
  const body = await req.json();
  return NextResponse.json({ ...body, note: 'Registration is now atomic — this endpoint is deprecated' });
}
