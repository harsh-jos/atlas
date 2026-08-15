import { cn } from '@/lib/utils';

export interface LogoProps {
  className?: string;
}

/**
 * The /atlas wordmark. The slash is a fixed gradient mark, independent of the
 * app's --accent token, so the same markup reads correctly on both light and
 * dark chrome. Both the mark and the text scale off the wrapping font-size.
 */
export function Logo({ className }: LogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[0.05em] text-sm font-semibold tracking-[-0.01em]',
        className
      )}
    >
      <svg
        viewBox="0 0 400 460"
        width="0.87em"
        height="1em"
        aria-hidden="true"
        className="shrink-0"
      >
        <linearGradient id="atlas-logo-slash" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#30AFFF" />
          <stop offset="100%" stopColor="#08213B" />
        </linearGradient>
        <path
          fill="url(#atlas-logo-slash)"
          d="M225,30 L325.3,20 Q375,15 351.8,59.3 L170,405 L68.3,432.1 Q20,445 42.1,400.2 Z"
        />
      </svg>
      atlas
    </span>
  );
}
