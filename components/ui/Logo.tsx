import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface LogoProps {
  className?: string;
}

/** The gradient slash is the mark; the wordmark contains only "atlas". */
export function Logo({ className }: LogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[0.05em] text-sm font-semibold tracking-[-0.01em]',
        className,
      )}
    >
      <Image
        src="/atlas-logo.svg"
        width={400}
        height={460}
        alt=""
        aria-hidden="true"
        className="h-[1em] w-[0.87em] shrink-0"
        unoptimized
      />
      atlas
    </span>
  );
}
