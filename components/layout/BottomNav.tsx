'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Network, Search, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isCreating, setIsCreating] = React.useState(false);

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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-canvas/90 backdrop-blur-md border-t-thin px-4 py-2 flex items-center justify-around h-14 pb-safe">
      <Link
        href="/"
        className={cn(
          'flex flex-col items-center gap-0.5 transition-colors',
          pathname === '/' ? 'text-accent' : 'text-faint hover:text-ink'
        )}
      >
        <Home className="h-[18px] w-[18px]" />
        <span className="text-[10px] font-medium">Home</span>
      </Link>

      <Link
        href="/graph"
        className={cn(
          'flex flex-col items-center gap-0.5 transition-colors',
          pathname === '/graph' ? 'text-accent' : 'text-faint hover:text-ink'
        )}
      >
        <Network className="h-[18px] w-[18px]" />
        <span className="text-[10px] font-medium">Graph</span>
      </Link>

      <Link
        href="/search"
        className={cn(
          'flex flex-col items-center gap-0.5 transition-colors',
          pathname.startsWith('/search') ? 'text-accent' : 'text-faint hover:text-ink'
        )}
      >
        <Search className="h-[18px] w-[18px]" />
        <span className="text-[10px] font-medium">Search</span>
      </Link>

      <button
        onClick={handleCreateNewEntry}
        disabled={isCreating}
        className="flex flex-col items-center gap-0.5 text-faint hover:text-ink transition-colors disabled:opacity-50 cursor-pointer"
      >
        <Plus className="h-[18px] w-[18px]" />
        <span className="text-[10px] font-medium">New</span>
      </button>
    </nav>
  );
}
