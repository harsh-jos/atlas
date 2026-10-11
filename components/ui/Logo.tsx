import { cn } from '@/lib/utils';

export interface LogoProps {
  className?: string;
}

/** The Atlas wordmark uses a sky-blue slash on every light surface. */
export function Logo({ className }: LogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[0.05em] text-sm font-semibold tracking-[-0.01em]',
        className,
      )}
    >
      <svg
        viewBox="0 0 400 460"
        width="0.87em"
        height="1em"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          fill="#38a9e2"
          d="M225,30 L325.3,20 Q375,15 351.8,59.3 L170,405 L68.3,432.1 Q20,445 42.1,400.2 Z"
        />
      </svg>
      atlas
    </span>
  );
}
