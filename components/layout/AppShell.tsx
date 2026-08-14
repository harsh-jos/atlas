'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { MobileBar } from './MobileBar';
import { BottomNav } from './BottomNav';

export interface AppShellProps {
  children: React.ReactNode;
  /** The past-chats list, fetched server-side once and interleaved into the client rail. */
  chatHistory: React.ReactNode;
}

/**
 * The app frame: a canvas-tinted rail beside a white content region. The window
 * never scrolls — <main> is the scroll container. The entry moment (`/login`)
 * is full-bleed, no chrome.
 */
export function AppShell({ children, chatHistory }: AppShellProps) {
  const pathname = usePathname();

  if (pathname.startsWith('/login')) return <>{children}</>;

  return (
    <div className="flex h-full">
      <Sidebar chatHistory={chatHistory} />
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <MobileBar />
        <main className="scroll-region min-h-0 flex-1">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
