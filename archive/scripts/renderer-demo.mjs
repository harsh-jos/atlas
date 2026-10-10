// Upserts a rich markdown entry to exercise the reading renderer.
// Run: node --env-file=.env scripts/renderer-demo.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));
const body = readFileSync(join(here, 'renderer-demo.md'), 'utf8');

const collection =
  (await db.collection.findFirst({ orderBy: { createdAt: 'asc' } })) ??
  (await db.collection.create({ data: { name: 'Foundations', slug: 'foundations', color: '#7b68ee' } }));

const slug = 'backpropagation-from-the-chain-rule-up';
const data = {
  title: 'Backpropagation, from the chain rule up',
  slug,
  summary:
    "How gradients flow backward through a network — the chain rule, a worked two-layer example, a tiny NumPy implementation, and the pitfalls that actually bite.",
  body,
  tags: ['deep-learning', 'concept', 'foundational'],
  collectionId: collection.id,
  metadata: { field: 'Deep Learning', difficulty: 'intermediate' },
};

const entry = await db.entry.upsert({ where: { slug }, update: data, create: data });
console.log(`ok: /entries/${entry.slug} (collection: ${collection.slug})`);
await db.$disconnect();
