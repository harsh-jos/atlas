import { Skeleton } from '@/components/ui/Skeleton';

// Instant fallback while a collection's entries load.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-5 h-9 w-56" />
      <Skeleton className="mt-3 h-4 w-80" />
      <div className="mt-8 overflow-hidden rounded-card border-thin bg-surface shadow-card divide-y divide-[var(--hairline)]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2.5 h-3.5 w-3/4" />
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
