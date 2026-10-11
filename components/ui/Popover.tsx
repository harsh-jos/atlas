'use client';
import * as React from 'react';
import Link from 'next/link';
import {
  Popover as Root,
  PopoverContent,
  PopoverTrigger,
} from '@/components/shadcn/popover';
import { cn } from '@/lib/utils';
export interface PopoverProps {
  renderTrigger: (props: {
    onClick: () => void;
    open: boolean;
  }) => React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
  closeOnSelect?: boolean;
}
export function Popover({
  renderTrigger,
  children,
  align = 'start',
  className,
  closeOnSelect = true,
}: PopoverProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Root open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {renderTrigger({ onClick: () => setOpen(!open), open })}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn('w-auto min-w-52 p-1.5', className)}
        onClick={closeOnSelect ? () => setOpen(false) : undefined}
      >
        {children}
      </PopoverContent>
    </Root>
  );
}
export interface PopoverItemProps {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}
export function PopoverItem({ href, active, children }: PopoverItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'focus-ring flex min-h-9 items-center justify-between gap-2 rounded-lg px-3 text-sm',
        active
          ? 'bg-accent-soft font-medium text-accent'
          : 'text-ink hover:bg-surface-soft',
      )}
    >
      {children}
    </Link>
  );
}
