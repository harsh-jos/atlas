import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'focus-ring flex h-10 w-full rounded-[10px] border-thin bg-surface px-3.5 text-[14px] text-ink transition-colors duration-[var(--dur-fast)] placeholder:text-faint hover:border-hairline-strong focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };
