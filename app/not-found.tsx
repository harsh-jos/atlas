import Link from 'next/link';
import { Button } from '@/components/ui/Button';

/** Shown for any `notFound()` — a missing entry, a stale link — instead of a bare 404. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[34rem] flex-col items-center justify-center px-5 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-ink">
        Nothing lives here
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        The page you’re after has moved or was never kept. Everything you’ve saved is still in your
        atlas.
      </p>
      <Link href="/" className="mt-7">
        <Button size="lg">Back to your library</Button>
      </Link>
    </div>
  );
}
