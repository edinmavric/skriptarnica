'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';

import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { votePollAction } from '@/server/actions/forum';

export function PollWidget({
  postId,
  options,
  myOptionId,
  canVote,
}: {
  postId: string;
  options: { id: string; label: string; votes: number }[];
  myOptionId: string | null;
  canVote: boolean;
}) {
  const t = useTranslations('forum.poll');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  // Optimistic choice and counts; the server result replaces them after refresh.
  const [state, setState] = useOptimistic({ options, myOptionId }, (current, optionId: string) => ({
    myOptionId: optionId,
    options: current.options.map((option) => ({
      ...option,
      votes:
        option.votes +
        (option.id === optionId ? 1 : 0) -
        (option.id === current.myOptionId ? 1 : 0),
    })),
  }));
  const total = state.options.reduce((sum, option) => sum + option.votes, 0);
  return (
    <fieldset className="flex flex-col gap-2" disabled={!canVote} aria-busy={pending}>
      <legend className="mb-1 text-sm text-ink-muted">{t('legend', { count: total })}</legend>
      {state.options.map((option) => {
        const share = total > 0 ? Math.round((option.votes / total) * 100) : 0;
        const mine = option.id === state.myOptionId;
        return (
          <label
            key={option.id}
            className={cn(
              'relative flex min-h-11 cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-md border px-3',
              mine ? 'border-pen' : 'border-field',
            )}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-pen-soft"
              style={{ width: `${share}%` }}
            />
            <span className="relative flex items-center gap-2">
              <input
                type="radio"
                name={`poll-${postId}`}
                checked={mine}
                onChange={() =>
                  startTransition(async () => {
                    setState(option.id);
                    const result = await votePollAction({ postId, optionId: option.id });
                    if (!result.ok) toast({ title: tAll(result.error.messageKey), tone: 'error' });
                    router.refresh();
                  })
                }
              />
              {option.label}
            </span>
            <span className="tabular relative text-sm">
              {t('result', { percent: share, votes: formatNumber(option.votes) })}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
