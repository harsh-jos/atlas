import db from '@/lib/db';
import { slugify } from '@/lib/utils';

export async function createUniqueEntrySlug(title: string, currentSlug?: string) {
  const baseSlug = slugify(title) || 'untitled';
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const existingEntry = await db.entry.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });

    if (!existingEntry || existingEntry.slug === currentSlug) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}
