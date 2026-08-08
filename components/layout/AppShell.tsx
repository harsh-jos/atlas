'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { MobileBar } from './MobileBar';
import { BottomNav } from './BottomNav';

/**
 * The app frame: a canvas-tinted rail beside a white content region. The window
 * never scrolls — <main> is the scroll container. The entry moment (`/login`)
 * is full-bleed, no chrome.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith('/login')) return <>{children}</>;

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <MobileBar />
        <main className="scroll-region min-h-0 flex-1">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
