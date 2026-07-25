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
          // Plus Jakarta at the custom 650 weight gives buttons a confident density; 10px radius per the system.
          'focus-ring inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] font-display font-[650] tracking-[-0.01em] transition-all duration-[var(--dur-fast)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45',
          // Primary action is deliberately neutral carbon — violet is reserved for brand moments.
          variant === 'primary' && 'bg-action text-white shadow-btn hover:bg-action-hover',
          variant === 'brand' && 'bg-accent text-white hover:bg-accent-hover',
          variant === 'secondary' &&
            'border-thin bg-surface text-ink shadow-raise hover:border-hairline-strong hover:bg-surface-soft',
          variant === 'ghost' && 'text-muted hover:bg-black/[0.04] hover:text-ink',
          variant === 'danger' && 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100/60',
          size === 'sm' && 'h-8 px-3 text-[12.5px]',
          size === 'md' && 'h-9 px-4 text-[13.5px]',
          size === 'lg' && 'h-11 px-5.5 text-[14.5px]',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
