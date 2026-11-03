import { cn } from '@/lib/cn';

/** Content-shaped placeholder. Compose these to match the real layout; no page spinners. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block animate-pulse rounded-sm bg-paper-sunk motion-reduce:animate-none',
        className,
      )}
    />
  );
}

export function NoteCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-rule p-3">
      <Skeleton className="aspect-[3/4] w-full" />
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  );
}

export function PostCardSkeleton() {
  return (
    <div className="flex gap-3 border-b border-rule py-4">
      <Skeleton className="h-20 w-10" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}

/** Row in a list page (notes, notifications, admin tables). */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-rule py-3">
      <Skeleton className="size-12 shrink-0" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <Skeleton className="h-5 w-16" />
    </div>
  );
}

/**
 * Route-level loading state (loading.tsx): the page's shape right away while its data loads.
 * `label` is announced to screen readers ("Učitava se…").
 */
export function PageSkeleton({
  label,
  variant = 'list',
}: {
  label: string;
  variant?: 'list' | 'grid' | 'posts' | 'note';
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
      </div>
      {variant === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <NoteCardSkeleton key={i} />
          ))}
        </div>
      ) : variant === 'posts' ? (
        <div className="flex flex-col">
          {Array.from({ length: 5 }, (_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      ) : variant === 'note' ? (
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="aspect-[3/4] w-full max-w-md" />
          </div>
          <div className="hidden flex-col gap-3 lg:flex">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {Array.from({ length: 6 }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      )}
    </div>
  );
}
