import db from '@/lib/db';
import { slugify } from '@/lib/utils';

export async function createUniqueNoteSlug(title: string, currentSlug?: string) {
  const baseSlug = slugify(title) || 'untitled-note';
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const existing = await db.note.findUnique({
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
