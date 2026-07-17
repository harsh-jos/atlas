import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { ALLOWED_IMAGE_TYPES, MAX_ASSET_BYTES, assetPath, ensureAssetsDir } from '@/lib/assets';

// Upload an image: store the bytes on disk, record metadata, return a URL the
// markdown body can reference.
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file was provided.' }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported image type.' }, { status: 415 });
  }
  if (file.size > MAX_ASSET_BYTES) {
    return NextResponse.json({ error: 'Image is too large (max 10 MB).' }, { status: 413 });
  }

  const id = randomUUID();
  await ensureAssetsDir();
  await writeFile(assetPath(id), Buffer.from(await file.arrayBuffer()));
  await db.asset.create({
    data: { id, fileName: file.name, mimeType: file.type, size: file.size },
  });

  return NextResponse.json({ id, url: `/assets/${id}`, fileName: file.name }, { status: 201 });
}
