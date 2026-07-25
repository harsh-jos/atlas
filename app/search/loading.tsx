import { PageContainer } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';

// Instant fallback while search runs — mirrors the header, field, and result rows.
export default function Loading() {
  return (
    <PageContainer>
      <Skeleton className="h-[10.5px] w-16" />
      <Skeleton className="mt-2.5 h-9 w-72" />

      <Skeleton className="mt-6 h-14 w-full rounded-2xl" />

      <div className="mt-8 overflow-hidden rounded-card border-thin bg-surface shadow-card divide-y divide-[var(--hairline)]">
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
    </PageContainer>
  );
}
