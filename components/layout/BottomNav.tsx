'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Library, Sparkles, Hammer, Network, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';

const ICONS = { Library, Sparkles, Hammer, Network, Search } as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="flex h-[3.75rem] shrink-0 items-stretch justify-around border-t bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      {NAV_ITEMS.map(({ href, label, icon, match }) => {
        const Icon = ICONS[icon];
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 font-medium transition-colors duration-[var(--dur-fast)]',
              active ? 'text-ink' : 'text-faint'
            )}
          >
            <Icon className={cn('h-[18px] w-[18px]', active && 'text-accent')} />
            <span className="text-[10px]">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
