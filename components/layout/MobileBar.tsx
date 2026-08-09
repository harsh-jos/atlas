'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';

/** Mobile-only header — the rail's job (brand + search) at phone width. */
export function MobileBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4 md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-action text-[12px] font-semibold text-white"
          aria-hidden="true"
        >
          A
        </span>
        <span className="text-sm font-semibold tracking-[-0.01em] text-ink">Atlas</span>
      </Link>
      <Link
        href="/search"
        aria-label="Search"
        className="focus-ring flex h-8 w-8 items-center justify-center rounded-[8px] text-faint transition-colors hover:bg-surface-soft hover:text-ink"
      >
        <Search className="h-4 w-4" />
      </Link>
    </header>
  );
}
