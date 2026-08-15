import { Skeleton } from '@/components/ui/Skeleton';

// Instant fallback while the entry loads — mirrors the reading view's column so
// the swap to real content is seamless.
export default function Loading() {
  return (
    <div className="mx-auto max-w-[54rem] px-5 py-12 sm:px-8">
      <div className="max-w-[34rem]">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="mt-9 h-3 w-28" />
        <Skeleton className="mt-3 h-9 w-3/4" />
        <Skeleton className="mt-4 h-4 w-52" />
        <Skeleton className="mt-8 h-16 w-full rounded-card" />
      </div>
      <div className="mt-9 grid gap-x-12 gap-y-10 xl:grid-cols-[minmax(0,34rem)_1fr]">
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="hidden space-y-2 xl:block">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  );
}
