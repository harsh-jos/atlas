import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'secondary' | 'accent';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex select-none items-center rounded-[10px] border px-2 py-0.5 font-display text-[11px] font-medium transition-colors',
        // Variants
        variant === 'default' && 'border-[var(--hairline)] bg-surface-soft text-muted',
        variant === 'secondary' && 'border-[var(--hairline)] bg-surface-soft text-muted',
        variant === 'success' && 'border-emerald-200/60 bg-emerald-50/70 text-emerald-700',
        variant === 'warning' && 'border-amber-200/60 bg-amber-50/70 text-amber-700',
        variant === 'accent' && 'border-[var(--accent-soft)] bg-[var(--accent-soft)] text-accent',
        className
      )}
      {...props}
    />
  );
}

export { Badge };
