import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Server-only helpers + policy for uploaded image assets. Bytes live on disk
// under ASSETS_DIR/<id>; Asset rows hold the metadata (see prisma schema).

export const MAX_ASSET_BYTES = 10 * 1024 * 1024; // 10 MB

// SVG is intentionally excluded — it can carry script and we serve inline.
export const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function assetsDir(): string {
  return resolve(process.env.ASSETS_DIR ?? join(process.cwd(), 'uploads'));
}

export function assetPath(id: string): string {
  return join(assetsDir(), id);
}

export async function ensureAssetsDir(): Promise<void> {
  await mkdir(assetsDir(), { recursive: true });
}
