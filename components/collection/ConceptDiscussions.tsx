import Link from 'next/link';
export interface Discussion {
  excerpt: string;
  question: string;
  createdAt: string;
  url: string;
}
export function ConceptDiscussions({
  discussions,
}: {
  discussions: Discussion[];
}) {
  if (!discussions.length) return null;
  return (
    <section
      className="my-6 rounded-xl border p-5"
      aria-label="Conversations about this idea"
    >
      <h2 className="mb-4 text-base font-semibold">Where you explored this</h2>
      <div className="space-y-5">
        {discussions.map((d, i) => (
          <article key={i}>
            <h3 className="text-sm font-medium">{d.question}</h3>
            <blockquote className="my-2 border-l-2 border-accent/30 pl-3 text-sm leading-relaxed text-muted">
              {d.excerpt}
            </blockquote>
            <Link
              href={d.url}
              className="text-sm text-accent underline underline-offset-4"
            >
              Open conversation →
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
