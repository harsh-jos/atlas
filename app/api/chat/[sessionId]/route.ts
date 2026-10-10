import { NextResponse } from 'next/server';
import { apiGet, ApiError } from '@/lib/api';
import type { ChatHistory } from '@/lib/api-types';

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const snapshot = await apiGet<ChatHistory>(`/agent/chat/${encodeURIComponent(sessionId)}`);
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return NextResponse.json({ detail: error.message }, { status: error.status || 503 });
  }
}
