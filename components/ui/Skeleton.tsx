import { cn } from '@/lib/utils';

/** A single shimmering placeholder block. Compose these into route loading states. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-lg bg-surface-soft',
        'after:absolute after:inset-0 after:animate-[shimmer_1.6s_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/70 after:to-transparent',
        className
      )}
    />
  );
}
