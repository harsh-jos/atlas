'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

/**
 * The last line of defence for a failed page load. Next.js scrubs the underlying message from
 * Server Component errors in production, so this speaks in calm, general terms and offers a way
 * forward rather than dumping a 500. The real cause is on the server logs, keyed by `digest`.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[34rem] flex-col items-center justify-center px-5 text-center">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-faint">Something broke</p>
      <h1 className="mt-3 font-title text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink">
        This page didn’t load
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Atlas hit an error while putting this together. It’s usually momentary — try again, and if
        it keeps happening the backend may be unreachable.
      </p>
      <div className="mt-7 flex items-center gap-3">
        <Button type="button" onClick={reset} size="lg">
          Try again
        </Button>
        <Link
          href="/"
          className="text-[14px] font-medium text-muted transition-colors hover:text-ink"
        >
          Go home
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 font-mono text-[11px] text-faint">Reference: {error.digest}</p>
      )}
    </div>
  );
}
