'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Library, Sparkles, Network, Search, Plus, LogOut } from 'lucide-react';
import { signOut } from '@/app/login/actions';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';
import { Logo } from '@/components/ui/Logo';

const ICONS = { Library, Sparkles, Network, Search } as const;

export interface SidebarProps {
  /** The past-chats list — a Server Component, interleaved in so this stays a client shell. */
  chatHistory: React.ReactNode;
}

/**
 * The persistent left rail: canvas-tinted, one carbon primary action, quiet rows.
 * The active row is a white card; the accent appears only on its icon.
 */
export function Sidebar({ chatHistory }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[var(--rail-width)] shrink-0 flex-col border-r bg-canvas md:flex">
      <div className="px-5 pb-6 pt-7">
        <Logo className="text-xl" />
      </div>

      <div className="px-3">
        <Link
          href="/chat"
          className="focus-ring flex h-9 items-center justify-center gap-1.5 rounded-full bg-action text-sm font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-action-hover"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New session
        </Link>
      </div>

      <nav className="mt-7 flex shrink-0 flex-col gap-0.5 px-3" aria-label="Workspace">
        {NAV_ITEMS.map(({ href, label, icon, match }) => {
          const Icon = ICONS[icon];
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'focus-ring flex h-8 items-center gap-2.5 rounded-[8px] px-2.5 text-sm transition-colors duration-[var(--dur-fast)]',
                active
                  ? 'border bg-surface font-medium text-ink shadow-card'
                  : 'text-muted hover:bg-surface-soft hover:text-ink'
              )}
            >
              <Icon
                className={cn('h-4 w-4', active ? 'text-accent' : 'text-faint')}
                aria-hidden="true"
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {chatHistory}

      <div className="mt-auto px-3 pb-4">
        <form action={signOut}>
          <button
            type="submit"
            className="focus-ring flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-sm text-muted transition-colors duration-[var(--dur-fast)] hover:bg-surface-soft hover:text-ink"
          >
            <LogOut className="h-4 w-4 text-faint" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
