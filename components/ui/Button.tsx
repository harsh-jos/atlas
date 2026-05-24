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
          'inline-flex items-center justify-center font-medium transition-all duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
          // Variants
          variant === 'primary' && 'bg-zinc-900 text-white hover:bg-zinc-800 focus-visible:ring-1 focus-visible:ring-zinc-950',
          variant === 'secondary' && 'bg-white text-zinc-900 border-thin border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-950',
          variant === 'ghost' && 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
          variant === 'danger' && 'bg-red-50 text-red-600 border-[0.5px] border-red-200/50 hover:bg-red-100/50',
          // Sizes
          size === 'sm' && 'h-8 px-3 text-xs rounded',
          size === 'md' && 'h-9 px-4 text-sm rounded-md',
          size === 'lg' && 'h-10 px-6 text-sm rounded-md',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
