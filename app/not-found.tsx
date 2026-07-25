import Link from 'next/link';

/** Shown for any `notFound()` — a missing entry, a stale link — instead of a bare 404. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[34rem] flex-col items-center justify-center px-5 text-center">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-faint">404</p>
      <h1 className="mt-3 font-title text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink">
        Nothing lives here
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        The page you’re after has moved or was never kept. Everything you’ve saved is still in your
        atlas.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex items-center text-[14px] font-medium text-accent transition-colors hover:text-accent-hover"
      >
        Back to your atlas
      </Link>
    </div>
  );
}
