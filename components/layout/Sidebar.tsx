'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Library, Sparkles, Network, Search, Plus, LogOut } from 'lucide-react';
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
        className="mx-5 mb-5 mt-5 w-fit"
        aria-label="Atlas home"
      >
        <Logo className="text-[23px]" />
      </Link>
      <div className="px-4">
        <Button
          asChild
          className="h-9 w-full justify-start rounded-lg px-3 shadow-none"
        >
          <Link href="/chat" onClick={onNavigate}>
            <Plus />
            New conversation
          </Link>
        </Button>
      </div>
      <p className="mb-1.5 mt-5 px-6 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
        Workspace
      </p>
      <nav className="flex flex-col gap-0.5 px-3" aria-label="Workspace">
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
                'flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors',
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
      <form action={signOut} className="border-t px-3 py-2">
        <Button
          type="submit"
          variant="ghost"
          className="h-9 w-full justify-start text-xs text-muted"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </form>
    </aside>
  );
}
