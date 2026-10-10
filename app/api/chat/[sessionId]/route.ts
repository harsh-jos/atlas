import { NextResponse } from 'next/server';
import { apiGet, ApiError } from '@/lib/api';
import type { ChatHistory } from '@/lib/api-types';

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const incoming = new URL(request.url).searchParams;
    const query = new URLSearchParams();
    for (const key of ['before', 'legacy_offset']) {
      const value = incoming.get(key);
      if (value) query.set(key, value);
    }
    const snapshot = await apiGet<ChatHistory>(`/agent/chat/${encodeURIComponent(sessionId)}?${query}`);
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return NextResponse.json({ detail: error.message }, { status: error.status || 503 });
  }
}
