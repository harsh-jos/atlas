'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, ChevronRight } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { MobileBar } from './MobileBar';
import { BottomNav } from './BottomNav';
import { TooltipProvider } from '@/components/shadcn/tooltip';
export interface AppShellProps {
  children: React.ReactNode;
  chatHistory: React.ReactNode;
  userName?: string;
}
export function AppShell({ children, chatHistory, userName }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isChat = pathname.startsWith('/chat');
  const isGraph = pathname.startsWith('/graph');
  const router = useRouter();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        router.push('/search');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);
  if (pathname.startsWith('/login'))
    return <TooltipProvider>{children}</TooltipProvider>;
  const title = pathname.startsWith('/chat')
    ? 'Learning space'
    : pathname.startsWith('/graph')
      ? 'Knowledge graph'
      : pathname.startsWith('/search')
        ? 'Search'
        : pathname.startsWith('/profile')
        ? 'Profile'
        : 'Library';
  const detail = pathname.startsWith('/entries')
    ? 'Explanation'
    : pathname.startsWith('/collections')
      ? 'Concept'
      : null;
  return (
    <TooltipProvider>
      <div className="flex h-dvh bg-canvas">
        <a
          href="#workspace-content"
          className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-surface p-3 focus:not-sr-only"
        >
          Skip to content
        </a>
        <Sidebar
          userName={userName}
          chatHistory={chatHistory}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
        />
        <div
          className={`flex min-w-0 flex-1 flex-col ${isChat ? '' : 'md:py-2 md:pr-2'}`}
        >
          <div
            className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-surface ${isChat ? '' : 'md:rounded-2xl md:border md:shadow-[0_2px_12px_#1b2b3e03]'}`}
          >
            <MobileBar chatHistory={chatHistory} userName={userName} />
            {!isChat && !isGraph && (
              <header className="hidden h-12 shrink-0 items-center justify-between border-b px-6 md:flex">
                <div className="flex items-center gap-2.5 text-xs">
                  <Link href="/" className="text-faint hover:text-accent">
                    Workspace
                  </Link>
                  <ChevronRight className="size-3 text-faint" />
                  <span className="font-medium text-ink">{title}</span>
                  {detail && (
                    <>
                      <ChevronRight className="size-3 text-faint" />
                      <span className="text-muted">{detail}</span>
                    </>
                  )}
                </div>
                <Link
                  href="/search"
                  className="flex h-8 items-center gap-2.5 rounded-lg border bg-canvas/70 px-3 text-xs text-muted"
                >
                  <Search className="size-3.5" />
                  Search your atlas
                  <kbd className="ml-6 text-[10px] text-faint">⌘ K</kbd>
                </Link>
              </header>
            )}
            <main
              id="workspace-content"
              tabIndex={-1}
              className={`${isChat || isGraph ? 'overflow-hidden' : 'scroll-region'} min-h-0 flex-1 outline-none`}
            >
              {children}
            </main>
            <BottomNav />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
