'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

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
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        // Redirect to the newly created entry in edit mode
        router.push(`/entries/${data.slug}?edit=true`);
        router.refresh();
      } else {
        console.error('Failed to create new entry');
      }
    } catch (error) {
      console.error('Error creating entry:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white border-b-thin border-zinc-200/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Left Section: Brand & Nav Links */}
        <div className="flex items-center gap-8">
          <Link href="/" className="text-sm font-medium tracking-tight text-zinc-900 select-none">
            Atlas
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/"
              className={cn(
                'text-xs font-medium transition-colors hover:text-zinc-900',
                pathname === '/' ? 'text-zinc-900' : 'text-zinc-400'
              )}
            >
              Home
            </Link>
            <Link
              href="/graph"
              className={cn(
                'text-xs font-medium transition-colors hover:text-zinc-900',
                pathname === '/graph' ? 'text-zinc-900' : 'text-zinc-400'
              )}
            >
              Graph
            </Link>
            <Link
              href="/search"
              className={cn(
                'text-xs font-medium transition-colors hover:text-zinc-900',
                pathname.startsWith('/search') ? 'text-zinc-900' : 'text-zinc-400'
              )}
            >
              Search
            </Link>
          </nav>
        </div>

        {/* Right Section: Search Bar & New Button */}
        <div className="flex items-center gap-4">
          <form onSubmit={handleSearchSubmit} className="relative hidden sm:block">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-48 lg:w-64 rounded-md border-thin border-zinc-200 pl-8 pr-3 text-xs bg-zinc-50/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 focus-visible:border-zinc-950 transition-colors"
            />
          </form>

          <Button
            size="sm"
            onClick={handleCreateNewEntry}
            disabled={isCreating}
            className="gap-1 h-8 text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New entry</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
