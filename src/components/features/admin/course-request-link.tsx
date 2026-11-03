'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { approveCourseRequestWithExistingAction } from '@/server/actions/admin-panel';

/** Approve a course proposal by placing an existing course on the program (no duplicate). */
export function CourseRequestLink({
  requestId,
  courseId,
  label,
}: {
  requestId: string;
  courseId: string;
  label: string;
}) {
  const t = useTranslations('admin.requests');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      aria-label={`${t('linkExisting')}: ${label}`}
      onClick={() =>
        startTransition(async () => {
          const result = await approveCourseRequestWithExistingAction({ requestId, courseId });
          if (result.ok) {
            toast({ title: t('linked'), tone: 'success' });
            router.refresh();
          } else toast({ title: tAll(result.error.messageKey), tone: 'error' });
        })
      }
    >
      {t('linkExisting')}
    </Button>
  );
}
