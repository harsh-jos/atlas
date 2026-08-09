import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'focus-ring inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors duration-[var(--dur-fast)] disabled:pointer-events-none disabled:opacity-45',
          variant === 'primary' && 'bg-action text-white hover:bg-action-hover',
          variant === 'secondary' && 'border bg-surface text-ink hover:bg-surface-soft',
          variant === 'ghost' && 'text-muted hover:bg-surface-soft hover:text-ink',
          // Destructive stays quiet: danger text, no red fill.
          variant === 'danger' &&
            'border border-danger-line bg-surface text-danger hover:bg-danger-soft',
          size === 'sm' && 'h-8 px-3.5 text-[13px]',
          size === 'md' && 'h-9 px-4 text-sm',
          size === 'lg' && 'h-10 px-5 text-sm',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
