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
