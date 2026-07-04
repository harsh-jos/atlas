'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Home', match: (p: string) => p === '/' },
  { href: '/graph', label: 'Graph', match: (p: string) => p.startsWith('/graph') },
  { href: '/search', label: 'Search', match: (p: string) => p.startsWith('/search') },
  { href: '/import', label: 'Import', match: (p: string) => p.startsWith('/import') },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleCreateNewEntry = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const response = await fetch('/api/entries', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        router.push(`/entries/${data.slug}?edit=true`);
        router.refresh();
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/40 bg-[var(--canvas)]/65 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        {/* Brand + nav */}
        <div className="flex items-center gap-9">
          <Link
            href="/"
            className="select-none font-display text-[19px] font-extrabold tracking-[-0.03em] text-ink"
          >
            Atlas
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => {
              const active = link.match(pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'font-display text-[14px] transition-colors',
                    active ? 'font-[650] text-ink' : 'font-medium text-muted hover:text-ink'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Search + create */}
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              type="search"
              placeholder="Search entries"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-52 rounded-lg border-thin bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-faint transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/15 lg:w-64"
            />
          </form>

          <Button
            size="sm"
            onClick={handleCreateNewEntry}
            disabled={isCreating}
            className="h-9 gap-1.5 rounded-lg px-3.5 text-[13px]"
          >
            {isCreating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            <span>{isCreating ? 'Creating…' : 'New entry'}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
