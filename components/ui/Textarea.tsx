import * as React from 'react';
import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'focus-ring flex min-h-[72px] w-full resize-none rounded-[12px] border-thin bg-surface px-3.5 py-2.5 text-[14px] leading-6 text-ink transition-colors duration-[var(--dur-fast)] placeholder:text-faint hover:border-hairline-strong focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };
