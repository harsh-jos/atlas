'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface PopoverProps {
  /** Renders the trigger — receives a click handler and the current open state. */
  renderTrigger: (props: { onClick: () => void; open: boolean }) => React.ReactNode;
  children: React.ReactNode;
  /** Which side of the trigger the panel hangs from. */
  align?: 'start' | 'end';
  className?: string;
  /** Off for panels with several independent controls (e.g. settings) where a
   * click should adjust one thing without dismissing the rest. Defaults on —
   * every other current use is a single pick that should close immediately. */
  closeOnSelect?: boolean;
}

/**
 * A small anchored dropdown — not the centered `Modal`, which is reserved for
 * things that genuinely interrupt. This is for lightweight choices (sort,
 * filter) that shouldn't cost a full-screen overlay. Closes on outside click
 * or Escape always; closes on an inner click too unless `closeOnSelect` is off.
 */
export function Popover({
  renderTrigger,
  children,
  align = 'start',
  className,
  closeOnSelect = true,
}: PopoverProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      {renderTrigger({ onClick: () => setOpen((value) => !value), open })}
      {open && (
        <div
          role="menu"
          onClick={closeOnSelect ? () => setOpen(false) : undefined}
          className={cn(
            'animate-rise absolute top-full z-30 mt-2 min-w-[13rem] overflow-hidden rounded-card border bg-surface p-1.5 shadow-pop',
            align === 'end' ? 'right-0' : 'left-0',
            className
          )}
          style={{ animationDuration: 'var(--dur-fast)' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface PopoverItemProps {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}

/**
 * A single row inside a Popover panel. Every current use is a URL-driven
 * filter (sort, tag) — same pattern as the rest of this server-rendered app —
 * so this is a styled `Link`, not a client-state button.
 */
export function PopoverItem({ href, active, children }: PopoverItemProps) {
  return (
    <Link
      href={href}
      role="menuitemradio"
      aria-checked={active}
      className={cn(
        'focus-ring flex h-8 w-full items-center justify-between gap-2 rounded-[8px] px-2.5 text-[13px] transition-colors duration-[var(--dur-fast)]',
        active ? 'bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-surface-soft'
      )}
    >
      {children}
    </Link>
  );
}
