'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Library,
  Sparkles,
  Network,
  Search,
  Plus,
  LogOut,
  ArrowUpRight,
  Compass,
} from 'lucide-react';
import { signOut } from '@/app/login/actions';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/shadcn/button';
const ICONS = { Library, Sparkles, Network, Search } as const;
export interface SidebarProps {
  chatHistory: React.ReactNode;
  mobile?: boolean;
  onNavigate?: () => void;
}
export function Sidebar({ chatHistory, mobile, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside
      className={cn(
        'h-full w-[var(--rail-width)] shrink-0 flex-col bg-canvas',
        mobile ? 'flex w-full' : 'hidden md:flex',
      )}
    >
      <Link
        href="/"
        onClick={onNavigate}
        className="mx-6 mb-8 mt-8 w-fit"
        aria-label="Atlas home"
      >
        <Logo className="text-[27px]" />
      </Link>
      <div className="px-4">
        <Button
          asChild
          className="h-11 w-full justify-start rounded-xl px-3.5 shadow-none"
        >
          <Link href="/chat" onClick={onNavigate}>
            <Plus />
            New conversation
          </Link>
        </Button>
      </div>
      <p className="mb-2 mt-8 px-7 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
        Workspace
      </p>
      <nav className="flex flex-col gap-1 px-4" aria-label="Workspace">
        {NAV_ITEMS.map(({ href, label, icon, match }) => {
          const Icon = ICONS[icon];
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] transition-colors',
                active
                  ? 'bg-white font-semibold text-accent shadow-[0_1px_4px_#1b2b3e08]'
                  : 'text-muted hover:bg-white/70 hover:text-ink',
              )}
            >
              <Icon className="size-[17px]" aria-hidden="true" />
              {label}
              {active && (
                <span className="ml-auto size-1.5 rounded-full bg-sky" />
              )}
            </Link>
          );
        })}
      </nav>
      <div
        className="flex min-h-0 flex-1 flex-col"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) onNavigate?.();
        }}
      >
        {chatHistory}
      </div>
      <div className="mx-4 mb-4 mt-5 rounded-xl border border-accent-line/60 bg-accent-soft/60 p-3.5">
        <Compass className="mb-2 size-4 text-accent" aria-hidden="true" />
        <p className="text-xs font-medium text-ink">Follow your curiosity.</p>
        <p className="mt-1 text-[11px] leading-5 text-muted">
          One question can open a whole new direction.
        </p>
        <Link
          href="/graph"
          onClick={onNavigate}
          className="mt-2 flex items-center gap-1 text-[11px] font-medium text-accent"
        >
          Explore connections <ArrowUpRight className="size-3" />
        </Link>
      </div>
      <form action={signOut} className="border-t px-4 py-4">
        <Button
          type="submit"
          variant="ghost"
          className="h-10 w-full justify-start text-xs text-muted"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </form>
    </aside>
  );
}
