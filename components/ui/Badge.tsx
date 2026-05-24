import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'secondary' | 'accent';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border-thin transition-colors select-none',
        // Variants
        variant === 'default' && 'bg-zinc-50 text-zinc-600 border-zinc-200/60',
        variant === 'secondary' && 'bg-zinc-100/50 text-zinc-500 border-zinc-200/40',
        variant === 'success' && 'bg-emerald-50/60 text-emerald-700 border-emerald-200/50',
        variant === 'warning' && 'bg-amber-50/60 text-amber-700 border-amber-200/50',
        variant === 'accent' && 'bg-blue-50/60 text-blue-700 border-blue-200/50',
        className
      )}
      {...props}
    />
  );
}

export { Badge };
