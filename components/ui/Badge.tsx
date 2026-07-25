import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic status only — green done, amber attention, blue in progress. */
  variant?: 'default' | 'secondary' | 'accent' | 'success' | 'warning' | 'info';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex select-none items-center gap-1.5 rounded-full border px-2.5 py-[3px] font-display text-[11px] font-[550] leading-none tracking-[-0.005em]',
        (variant === 'default' || variant === 'secondary') &&
          'border-hairline bg-surface-soft text-muted',
        variant === 'accent' && 'border-accent-soft bg-accent-soft text-accent',
        variant === 'success' && 'border-success-line bg-success-soft text-success',
        variant === 'warning' && 'border-warning-line bg-warning-soft text-warning',
        variant === 'info' && 'border-info-line bg-info-soft text-info',
        className
      )}
      {...props}
    />
  );
}

export { Badge };
