import * as React from 'react';
import { Button as ShadcnButton } from '@/components/shadcn/button';
import { cn } from '@/lib/utils';
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, ...props }, ref) => (
    <ShadcnButton
      ref={ref}
      variant={
        variant === 'primary'
          ? 'default'
          : variant === 'secondary'
            ? 'outline'
            : variant === 'danger'
              ? 'outline'
              : 'ghost'
      }
      size={size === 'md' ? 'default' : size}
      className={cn(
        'rounded-lg',
        variant === 'danger' &&
          'border-danger-line text-danger hover:bg-danger-soft hover:text-danger',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
export { Button };
