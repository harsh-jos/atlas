'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Network, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/graph', label: 'Graph', icon: Network, match: (p: string) => p.startsWith('/graph') },
  { href: '/search', label: 'Search', icon: Search, match: (p: string) => p.startsWith('/search') },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-canvas/90 backdrop-blur-md border-t-thin px-4 py-2 flex items-center justify-around h-14 pb-safe">
      {NAV_LINKS.map(({ href, label, icon: Icon, match }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex flex-col items-center gap-0.5 transition-colors',
            match(pathname) ? 'text-accent' : 'text-faint hover:text-ink'
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
          <span className="text-[10px] font-medium">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
