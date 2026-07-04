import { Skeleton } from '@/components/ui/Skeleton';

// Instant fallback while search runs.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-3 h-4 w-48" />
      <div className="mt-7 overflow-hidden rounded-card border-thin bg-surface shadow-card divide-y divide-[var(--hairline)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="mt-2.5 h-5 w-2/3" />
            <Skeleton className="mt-2.5 h-4 w-full" />
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-4 w-14 rounded-full" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
