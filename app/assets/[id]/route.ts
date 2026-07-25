import { cookies } from 'next/headers';
import { TOKEN_COOKIE } from '@/lib/api';

/**
 * The backend guards `/assets/{id}` with the bearer token, which lives in an httpOnly
 * cookie — so an `<img>` can neither reach the backend directly nor be rewritten to it
 * unauthenticated. This streams the backend's bytes through, adding the token server-side.
 */
const API_URL = process.env.ATLAS_API_URL ?? 'http://localhost:8000';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;

  const response = await fetch(`${API_URL}/assets/${encodeURIComponent(id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });

  if (!response.ok || !response.body) {
    return new Response(null, { status: response.status });
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
