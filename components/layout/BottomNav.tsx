'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Library, Sparkles, Network, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';

const ICONS = { Library, Sparkles, Network, Search } as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="flex h-[3.75rem] shrink-0 items-stretch justify-around border-t-thin bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      {NAV_ITEMS.map(({ href, label, icon, match }) => {
        const Icon = ICONS[icon];
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-[var(--dur-fast)]',
              active ? 'text-ink' : 'text-faint'
            )}
          >
            <Icon className={cn('h-[18px] w-[18px]', active && 'text-accent')} />
            <span className={cn('font-display text-[10px]', active ? 'font-[650]' : 'font-medium')}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
