import { cn } from '@/lib/utils';

/** The wordmark's slash — fixed brand blue, independent of the app's --accent token. */
const SLASH_BLUE = '#66A3FF';

export interface LogoProps {
  className?: string;
}

/**
 * The /atlas wordmark. Has no color of its own beyond the slash — it inherits
 * from its container, so the same markup reads correctly on both light and
 * dark chrome.
 */
export function Logo({ className }: LogoProps) {
  return (
    <span className={cn('text-sm font-semibold tracking-[-0.01em]', className)}>
      <span className="font-normal" style={{ color: SLASH_BLUE }}>
        /
      </span>
      atlas
    </span>
  );
}
