import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** `icon` is a fixed square for a single icon child — no ad-hoc width overrides at call sites. */
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'focus-ring inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-all duration-[var(--dur-fast)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 disabled:active:scale-100',
          variant === 'primary' && 'bg-action text-white hover:bg-action-hover',
          variant === 'secondary' && 'border bg-surface text-ink hover:bg-surface-soft',
          variant === 'ghost' && 'text-muted hover:bg-surface-soft hover:text-ink',
          // Destructive stays quiet: danger text, no red fill.
          variant === 'danger' &&
            'border border-danger-line bg-surface text-danger hover:bg-danger-soft',
          size === 'sm' && 'h-7 px-3 text-[12.5px]',
          size === 'md' && 'h-8 px-3.5 text-[13px]',
          size === 'lg' && 'h-9 px-4 text-[13.5px]',
          size === 'icon' && 'h-8 w-8 p-0',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
