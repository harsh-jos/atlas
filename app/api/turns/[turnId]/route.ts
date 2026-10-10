import { NextResponse } from 'next/server';
import { apiGet, ApiError } from '@/lib/api';
import type { ChatTurn } from '@/lib/api-types';

export async function GET(_request: Request, { params }: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await params;
  try {
    const turn = await apiGet<ChatTurn>(`/agent/turns/${encodeURIComponent(turnId)}`);
    return NextResponse.json(turn, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return NextResponse.json({ detail: error.message }, { status: error.status || 503 });
  }
}
