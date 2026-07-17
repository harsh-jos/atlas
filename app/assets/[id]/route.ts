import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { assetPath } from '@/lib/assets';

interface AssetRouteContext {
  params: Promise<{ id: string }>;
}

// Serve an uploaded image by id with its recorded content type.
export async function GET(_request: Request, context: AssetRouteContext) {
  const { id } = await context.params;
  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const bytes = await readFile(assetPath(id));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': asset.mimeType,
        'Content-Length': String(asset.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
