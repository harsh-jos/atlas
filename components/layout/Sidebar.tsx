'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Library, Sparkles, Network, Search, Plus, LogOut } from 'lucide-react';
import { signOut } from '@/app/login/actions';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';

const ICONS = { Library, Sparkles, Network, Search } as const;

/**
 * The persistent left rail. Calm information density: line icons, a subtly filled
 * selected row, one carbon primary action at the top.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[var(--rail-width)] shrink-0 flex-col border-r-thin bg-surface md:flex">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent font-display text-[13px] font-bold text-white"
          aria-hidden="true"
        >
          A
        </span>
        <span className="font-display text-[16px] font-bold tracking-[-0.03em] text-ink">
          Atlas
        </span>
      </div>

      <div className="px-3">
        <Link
          href="/chat"
          className="focus-ring flex h-9 items-center justify-between rounded-[10px] bg-action px-3 font-display text-[13px] font-[650] text-white shadow-btn transition-colors duration-[var(--dur-fast)] hover:bg-action-hover"
        >
          New session
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <nav className="mt-6 flex flex-col gap-0.5 px-3">
        <p className="px-2.5 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          Workspace
        </p>
        {NAV_ITEMS.map(({ href, label, icon, match }) => {
          const Icon = ICONS[icon];
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'focus-ring group flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 font-display text-[13.5px] transition-colors duration-[var(--dur-fast)]',
                active
                  ? 'bg-surface font-[650] text-ink shadow-raise'
                  : 'font-medium text-muted hover:bg-black/[0.035] hover:text-ink'
              )}
            >
              <Icon
                className={cn('h-[16px] w-[16px]', active ? 'text-accent' : 'text-faint')}
                aria-hidden="true"
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pb-4">
        <form action={signOut}>
          <button
            type="submit"
            className="focus-ring flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 font-display text-[13px] font-medium text-faint transition-colors duration-[var(--dur-fast)] hover:bg-black/[0.035] hover:text-ink"
          >
            <LogOut className="h-[15px] w-[15px]" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
