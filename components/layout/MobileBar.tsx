'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';

/** Mobile-only header — the rail's job (brand + search) at phone width. */
export function MobileBar() {
  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b-thin px-4 md:hidden">
      <Link href="/" className="flex items-center gap-2.5">
        <span
          className="flex h-6.5 w-6.5 items-center justify-center rounded-[8px] bg-accent font-display text-[12px] font-bold text-white"
          aria-hidden="true"
        >
          A
        </span>
        <span className="font-display text-[15px] font-bold tracking-[-0.03em] text-ink">
          Atlas
        </span>
      </Link>
      <Link
        href="/search"
        aria-label="Search"
        className="focus-ring flex h-8 w-8 items-center justify-center rounded-[9px] text-faint transition-colors hover:bg-surface-soft hover:text-ink"
      >
        <Search className="h-[17px] w-[17px]" />
      </Link>
    </header>
  );
}
