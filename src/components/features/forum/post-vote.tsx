'use client';

import { useTranslations } from 'next-intl';

import { useToast } from '@/components/ui/toast';
import { VoteControl, type VoteValue } from '@/components/ui/vote-control';
import { appError, err } from '@/lib/result';
import { voteAction } from '@/server/actions/forum';

/** Optimistic vote bound to the server action; errors are shown and the server state wins. */
export function TargetVote({
  targetType,
  targetId,
  score,
  userVote,
  label,
  orientation = 'vertical',
  disabled,
}: {
  targetType: 'post' | 'comment';
  targetId: string;
  score: number;
  userVote: VoteValue;
  label: string;
  orientation?: 'vertical' | 'horizontal';
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const tAll = useTranslations() as unknown as (key: string) => string;
  return (
    <VoteControl
      score={score}
      userVote={userVote}
      label={label}
      orientation={orientation}
      disabled={disabled}
      onVote={async (value) => {
        const result = await voteAction({ targetType, targetId, value });
        if (!result.ok) {
          toast({ title: tAll(result.error.messageKey), tone: 'error' });
          return err(appError(result.error.code, result.error.messageKey));
        }
        return result;
      }}
    />
  );
}
