import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge as ShadcnBadge } from '@/components/shadcn/badge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic state only — success, warning, danger; accent/info for "ours/in progress". */
  variant?:
    | 'default'
    | 'secondary'
    | 'accent'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <ShadcnBadge
      variant="outline"
      className={cn(
        'inline-flex select-none items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
        (variant === 'default' || variant === 'secondary') &&
          'border-hairline bg-surface-soft text-muted',
        (variant === 'accent' || variant === 'info') &&
          'border-accent-line bg-accent-soft text-accent',
        variant === 'success' &&
          'border-success-line bg-success-soft text-success',
        variant === 'warning' &&
          'border-warning-line bg-warning-soft text-warning',
        variant === 'danger' && 'border-danger-line bg-danger-soft text-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
