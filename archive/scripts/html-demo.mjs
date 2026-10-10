// Upserts an entry authored in raw HTML (bodyHtml) to test HtmlBody + sanitization.
// Run: node --env-file=.env scripts/html-demo.mjs
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const html = `
<h2>Hand-authored HTML</h2>
<p>This node is written in <strong>raw HTML</strong>, not markdown — yet it renders through the <em>same</em> styled components, with inline <code>code()</code> too.</p>
<script>alert('xss')</script>
<p onclick="alert('xss')">This paragraph carried an onclick handler that should be stripped by the sanitizer.</p>
<ul>
  <li>A first point.</li>
  <li>A second point with a <a href="https://example.com">safe link</a>.</li>
</ul>
<blockquote>A pull quote authored directly in HTML.</blockquote>
<pre><code>function greet(name) {
  return "hi " + name;
}</code></pre>
<table>
  <thead><tr><th>Layer</th><th>Operation</th></tr></thead>
  <tbody>
    <tr><td>Linear</td><td>Wx + b</td></tr>
    <tr><td>Activation</td><td>sigma(z)</td></tr>
  </tbody>
</table>
<p>An image referenced from a public/uploaded asset:</p>
<img src="/backprop-diagram.svg" alt="A diagram rendered inside HTML content" />
`;

const collection =
  (await db.collection.findFirst({ orderBy: { createdAt: 'asc' } })) ??
  (await db.collection.create({ data: { name: 'Foundations', slug: 'foundations', color: '#7b68ee' } }));

const slug = 'html-body-demo';
const data = {
  title: 'HTML body demo',
  slug,
  summary: 'A node authored directly in HTML, rendered through the same styled reading components.',
  body: 'This markdown body should be ignored because an HTML body is set.',
  bodyHtml: html,
  tags: ['demo'],
  collectionId: collection.id,
};

const entry = await db.entry.upsert({ where: { slug }, update: data, create: data });
console.log(`ok: /entries/${entry.slug}`);
await db.$disconnect();
