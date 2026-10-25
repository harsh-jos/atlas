import { apiGet } from '@/lib/api';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return Response.json(
    await apiGet(`/artifacts/${encodeURIComponent(slug)}/revisions`),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
