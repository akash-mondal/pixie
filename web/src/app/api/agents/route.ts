// GET /api/agents — List registered agents (from in-memory store for hackathon)

import { NextResponse } from 'next/server';
import { getAgentStore } from '@/lib/agent-store';

export async function GET() {
  const agents = getAgentStore().getAll();
  return NextResponse.json(agents);
}
