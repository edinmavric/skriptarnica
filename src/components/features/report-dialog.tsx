'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { FlagIcon } from '@/components/ui/icons';
import type { ReportInput } from '@/lib/validation/reports';

// The dialog and its form load on first click; most visitors never report anything (SPEC §8.2).
const ReportDialogContent = dynamic(() => import('./report-dialog-content'), { ssr: false });

/** Report anything (notes, reviews, posts, comments, users, communities). */
export function ReportDialog({
  targetType,
  targetId,
  compact,
}: {
  targetType: ReportInput['targetType'];
  targetId: string;
  compact?: boolean;
}) {
  const t = useTranslations('reports');
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // Without a Radix Trigger, focus goes back to the button by hand when the dialog closes.
  const change = (next: boolean) => {
    setOpen(next);
    if (!next) requestAnimationFrame(() => trigger.current?.focus());
  };
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size={compact ? 'sm' : 'md'}
        aria-haspopup="dialog"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
      >
        <FlagIcon /> {t('trigger')}
      </Button>
      {loaded ? (
        <ReportDialogContent
          targetType={targetType}
          targetId={targetId}
          open={open}
          setOpen={change}
        />
      ) : null}
    </>
  );
}
