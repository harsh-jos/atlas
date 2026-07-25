import { Skeleton } from '@/components/ui/Skeleton';

// Instant fallback while the entry loads — mirrors the reading view's column so
// the swap to real content is seamless.
export default function Loading() {
  return (
    <div className="mx-auto max-w-[43rem] px-5 py-12 sm:px-8">
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-9 h-3 w-28" />
      <Skeleton className="mt-3 h-9 w-3/4" />
      <Skeleton className="mt-4 h-4 w-52" />
      <Skeleton className="mt-8 h-16 w-full rounded-card" />
      <div className="mt-8 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
