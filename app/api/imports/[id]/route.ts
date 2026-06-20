import { NextResponse } from 'next/server';
import { importServiceUrl } from '@/lib/import-service';

interface ImportStatusContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: ImportStatusContext) {
  const { id } = await context.params;

  try {
    const response = await fetch(`${importServiceUrl()}/imports/${id}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'The import service is unreachable.' }, { status: 502 });
  }
}
