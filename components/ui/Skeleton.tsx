import { cn } from '@/lib/utils';

/** A single shimmering placeholder block. Compose these into route loading states. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-soft', className)}
    />
  );
}
