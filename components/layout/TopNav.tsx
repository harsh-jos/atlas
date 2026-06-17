'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Plus, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Home', match: (p: string) => p === '/' },
  { href: '/notes', label: 'Notes', match: (p: string) => p.startsWith('/notes') },
  { href: '/search', label: 'Search', match: (p: string) => p.startsWith('/search') },
  { href: '/graph', label: 'Graph', match: (p: string) => p.startsWith('/graph') },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const [isCreatingNote, setIsCreatingNote] = React.useState(false);

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

  const handleCreateNewNote = async () => {
    if (isCreatingNote) return;
    setIsCreatingNote(true);
    try {
      const response = await fetch('/api/notes', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        router.push(`/notes/${data.slug}?edit=true`);
        router.refresh();
      }
    } finally {
      setIsCreatingNote(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b-thin bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        {/* Brand + nav */}
        <div className="flex items-center gap-9">
          <Link
            href="/"
            className="select-none text-[18px] font-semibold tracking-[-0.02em] text-ink"
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
                    'text-[13px] transition-colors',
                    active ? 'font-medium text-ink' : 'text-muted hover:text-ink'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Search + create */}
        <div className="flex items-center gap-2.5">
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
            variant="secondary"
            size="sm"
            onClick={handleCreateNewNote}
            disabled={isCreatingNote}
            className="hidden h-9 gap-1.5 rounded-lg px-3 text-[13px] lg:inline-flex"
          >
            <NotebookPen className="h-3.5 w-3.5" />
            <span>{isCreatingNote ? 'Creating' : 'New note'}</span>
          </Button>

          <Button
            size="sm"
            onClick={handleCreateNewEntry}
            disabled={isCreating}
            className="h-9 gap-1.5 rounded-lg px-3.5 text-[13px]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New entry</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
