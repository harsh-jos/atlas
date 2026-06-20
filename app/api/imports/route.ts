import { NextResponse } from 'next/server';
import { importServiceUrl } from '@/lib/import-service';

const SERVICE_DOWN =
  'The import service is unreachable. Start it with `uv run uvicorn app.main:app` in import-pipeline/.';

async function passthrough(response: Response) {
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}

// Proxy to the local Python service. JSON bodies go to /imports; file uploads
// (multipart) go to /imports/file. Keeping it same-origin avoids CORS.
export async function POST(request: Request) {
  const base = importServiceUrl();
  const contentType = request.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      return passthrough(await fetch(`${base}/imports/file`, { method: 'POST', body: form }));
    }

    const body = await request.json();
    return passthrough(
      await fetch(`${base}/imports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  } catch {
    return NextResponse.json({ error: SERVICE_DOWN }, { status: 502 });
  }
}
