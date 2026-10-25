'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type { CatalogEntityType } from '@/lib/validation/admin';
import { rejectCatalogRequestAction } from '@/server/actions/admin-panel';

import { CatalogForm, type Option } from './catalog-form';

export function CatalogRequestActions({
  requestId,
  type,
  initial,
  universities,
  faculties,
}: {
  requestId: string;
  type: CatalogEntityType;
  initial: Record<string, string>;
  universities: Option[];
  faculties: Option[];
}) {
  const t = useTranslations('admin.requests');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  if (mode === 'approve')
    return (
      <div className="flex flex-col gap-2 rounded-md border border-rule p-3">
        <CatalogForm
          type={type}
          initial={initial}
          universities={universities}
          faculties={faculties}
          requestId={requestId}
          onDone={() => setMode('idle')}
        />
        <Button variant="ghost" className="self-start" onClick={() => setMode('idle')}>
          {t('cancel')}
        </Button>
      </div>
    );
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Button size="sm" onClick={() => setMode('approve')}>
        {t('approve')}
      </Button>
      {mode === 'reject' ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t('reason')}</span>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-9"
            />
          </label>
          <Button
            size="sm"
            variant="danger"
            loading={pending}
            disabled={reason.trim().length < 5}
            onClick={() =>
              startTransition(async () => {
                const result = await rejectCatalogRequestAction({ requestId, reason });
                if (result.ok) router.refresh();
                else toast({ title: tAll(result.error.messageKey), tone: 'error' });
              })
            }
          >
            {t('confirmReject')}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setMode('reject')}>
          {t('reject')}
        </Button>
      )}
    </div>
  );
}
