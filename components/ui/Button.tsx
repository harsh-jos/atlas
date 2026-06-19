import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // Plus Jakarta at the custom 650 weight gives buttons a confident density; 9px radius per the system.
          'inline-flex cursor-pointer select-none items-center justify-center rounded-[9px] font-display font-[650] transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
          // Primary action is deliberately neutral carbon — violet is reserved for brand moments.
          variant === 'primary' &&
            'bg-action text-white shadow-btn hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/25',
          variant === 'brand' &&
            'bg-accent text-white hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
          variant === 'secondary' &&
            'border-thin bg-surface text-ink hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/10',
          variant === 'ghost' && 'text-muted hover:bg-black/[0.04] hover:text-ink',
          variant === 'danger' && 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100/60',
          size === 'sm' && 'h-8 px-3.5 text-[13px]',
          size === 'md' && 'h-9 px-4.5 text-sm',
          size === 'lg' && 'h-11 px-6 text-sm',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
