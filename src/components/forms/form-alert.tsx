import { AlertIcon, CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/** Form-level message; announced to screen readers. */
export function FormAlert({
  message,
  tone = 'error',
}: {
  message: string | null;
  tone?: 'error' | 'success';
}) {
  if (!message) return null;
  const Icon = tone === 'error' ? AlertIcon : CheckIcon;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md px-3 py-2.5 text-[0.95rem]',
        tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success',
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <span className="text-ink">{message}</span>
    </div>
  );
}
