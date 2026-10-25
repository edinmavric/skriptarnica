'use client';

import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';

import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import type { Result } from '@/lib/result';

import { ArrowDownIcon, ArrowUpIcon } from './icons';

export type VoteValue = -1 | 0 | 1;

interface VoteState {
  score: number;
  userVote: VoteValue;
}

/**
 * Optimistic voting (SPEC §4.7): the UI updates immediately; the server result is the
 * source of truth and replaces the optimistic value when the action resolves.
 */
export function VoteControl({
  score,
  userVote,
  onVote,
  orientation = 'vertical',
  disabled,
  label,
}: {
  score: number;
  userVote: VoteValue;
  onVote: (value: VoteValue) => Promise<Result<VoteState>>;
  orientation?: 'vertical' | 'horizontal';
  disabled?: boolean;
  /** Accessible name of the voted item, e.g. the post title. */
  label: string;
}) {
  const t = useTranslations('ui.vote');
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic<VoteState, VoteValue>(
    { score, userVote },
    (state, next) => ({ score: state.score - state.userVote + next, userVote: next }),
  );

  function vote(direction: 1 | -1) {
    const next: VoteValue = optimistic.userVote === direction ? 0 : direction;
    startTransition(async () => {
      setOptimistic(next);
      await onVote(next);
    });
  }

  return (
    <div
      role="group"
      aria-label={t('group', { label })}
      className={cn(
        'inline-flex items-center gap-0.5 text-ink-muted',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
      )}
    >
      <button
        type="button"
        aria-pressed={optimistic.userVote === 1}
        aria-label={t('up')}
        disabled={disabled}
        onClick={() => vote(1)}
        className={cn(
          'grid size-11 place-items-center rounded-md hover:bg-paper-sunk hover:text-ink disabled:opacity-50',
          optimistic.userVote === 1 && 'text-pen',
        )}
      >
        <ArrowUpIcon className="size-5" strokeWidth={optimistic.userVote === 1 ? 2.5 : 1.75} />
      </button>
      <span
        className={cn(
          'tabular min-w-[2ch] text-center text-sm font-semibold text-ink',
          pending && 'opacity-80',
        )}
        aria-live="polite"
        aria-label={t('score', { score: optimistic.score })}
      >
        {formatNumber(optimistic.score)}
      </span>
      <button
        type="button"
        aria-pressed={optimistic.userVote === -1}
        aria-label={t('down')}
        disabled={disabled}
        onClick={() => vote(-1)}
        className={cn(
          'grid size-11 place-items-center rounded-md hover:bg-paper-sunk hover:text-ink disabled:opacity-50',
          optimistic.userVote === -1 && 'text-danger',
        )}
      >
        <ArrowDownIcon className="size-5" strokeWidth={optimistic.userVote === -1 ? 2.5 : 1.75} />
      </button>
    </div>
  );
}
