import { Skeleton } from '@/components/ui/Skeleton';
import { PageContainer } from '@/components/layout/PageHeader';

// Instant fallback while a collection's entries load.
export default function Loading() {
  return (
    <PageContainer>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-6 h-9 w-56" />
      <Skeleton className="mt-3 h-4 w-80" />
      <div className="mt-8 overflow-hidden rounded-card border bg-surface shadow-card divide-y divide-[var(--hairline)]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2.5 h-3.5 w-3/4" />
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-4 w-14 rounded-md" />
              <Skeleton className="h-4 w-14 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
