'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { MobileBar } from './MobileBar';
import { BottomNav } from './BottomNav';

/**
 * The app frame: one rounded container floating on the backdrop, holding the rail and a
 * single scrolling content region. The entry moment (`/login`) is full-bleed — no chrome.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith('/login')) return <>{children}</>;

  return (
    <div className="fixed inset-0 flex overflow-hidden border-thin bg-surface md:inset-[var(--frame-inset)] md:rounded-[var(--frame-radius)] md:shadow-frame">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar />
        {/* Canvas tint here, white cards above it — the rail stays white so the two read apart. */}
        <main className="scroll-region min-h-0 flex-1 bg-canvas">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
