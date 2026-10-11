import { NextResponse } from 'next/server';
import { apiStream, ApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await params;
  try {
    return await apiStream(`/agent/turns/${encodeURIComponent(turnId)}/events`, request);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return NextResponse.json({ detail: error.message }, { status: error.status || 503 });
  }
}
