import db from '@/lib/db';
import { slugify } from '@/lib/utils';

export async function createUniqueCollectionSlug(name: string, currentSlug?: string) {
  const baseSlug = slugify(name) || 'collection';
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const existing = await db.collection.findUnique({
      where: { slug },
      select: { slug: true },
    });

    if (!existing || existing.slug === currentSlug) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}
