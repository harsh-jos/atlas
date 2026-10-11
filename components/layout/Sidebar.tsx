'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Library,
  Sparkles,
  Network,
  Search,
  SquarePen,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { signOut } from '@/app/login/actions';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/shadcn/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/tooltip';
const ICONS = { Library, Sparkles, Network, Search } as const;
export interface SidebarProps {
  chatHistory: React.ReactNode;
  mobile?: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}
export function Sidebar({
  chatHistory,
  mobile,
  onNavigate,
  collapsed = false,
  onToggle,
}: SidebarProps) {
  const pathname = usePathname();
  const compact = collapsed && !mobile;
  return (
    <aside
      className={cn(
        'h-full min-w-0 shrink-0 flex-col border-r bg-[#f6f7f9]',
        mobile ? 'flex w-full border-0' : 'hidden md:flex',
        !mobile && (compact ? 'w-16' : 'w-[var(--rail-width)]'),
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center',
          compact ? 'justify-center' : 'justify-between px-4',
        )}
      >
        {!compact && (
          <Link href="/" onClick={onNavigate} aria-label="Atlas home">
            <Logo className="text-[22px]" />
          </Link>
        )}
        <div className="flex gap-0.5">
          {!compact && !mobile && (
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className="text-muted hover:bg-black/5 hover:text-ink"
            >
              <Link
                href="/search"
                onClick={onNavigate}
                aria-label="Search your atlas"
              >
                <Search className="size-4" />
              </Link>
            </Button>
          )}
          {!mobile && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggle}
              aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
              className="text-muted hover:bg-black/5 hover:text-ink"
            >
              {compact ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
          )}
        </div>
      </div>
      <div className={compact ? 'px-2' : 'px-3'}>
        <Button
          asChild
          variant="ghost"
          className={cn(
            'h-9 rounded-lg font-medium text-ink hover:bg-black/5',
            compact ? 'w-full px-0' : 'w-full justify-start gap-2.5 px-3',
          )}
        >
          <Link
            href="/chat"
            onClick={onNavigate}
            aria-label="New conversation"
            title={compact ? 'New conversation' : undefined}
          >
            <SquarePen className="size-[17px]" />
            {!compact && 'New conversation'}
          </Link>
        </Button>
      </div>
      <nav
        className={cn(
          'mt-3 flex shrink-0 flex-col gap-0.5',
          compact ? 'px-2' : 'px-3',
        )}
        aria-label="Workspace"
      >
        {NAV_ITEMS.filter(
          (item) => compact || mobile || item.icon !== 'Search',
        ).map(({ href, label, icon, match }) => {
          const Icon = ICONS[icon];
          const active = match(pathname);
          const link = (
            <Link
              href={href}
              onClick={onNavigate}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center rounded-lg text-[13px] transition-colors',
                compact ? 'justify-center' : 'gap-2.5 px-3',
                active
                  ? 'bg-black/[0.055] font-medium text-ink'
                  : 'text-muted hover:bg-black/[0.035] hover:text-ink',
              )}
            >
              <Icon className="size-[17px]" aria-hidden="true" />
              {!compact && label}
            </Link>
          );
          return compact ? (
            <Tooltip key={href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          ) : (
            <div key={href}>{link}</div>
          );
        })}
      </nav>
      {!compact && (
        <div
          className="flex min-h-0 flex-1 flex-col"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) onNavigate?.();
          }}
        >
          {chatHistory}
        </div>
      )}
      <form
        action={signOut}
        className={cn(
          'mt-auto shrink-0 border-t border-black/5 py-3',
          compact ? 'px-2' : 'px-3',
        )}
      >
        <Button
          type="submit"
          variant="ghost"
          aria-label="Sign out"
          title={compact ? 'Sign out' : undefined}
          className={cn(
            'h-9 w-full text-[13px] text-muted hover:bg-black/5 hover:text-ink',
            compact ? 'px-0' : 'justify-start gap-2.5 px-3',
          )}
        >
          <LogOut className="size-4" />
          {!compact && 'Sign out'}
        </Button>
      </form>
    </aside>
  );
}
