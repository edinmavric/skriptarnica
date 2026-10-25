'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { updatePrivacyAction } from '@/server/actions/account';

type Privacy = { showFaculty: boolean; showProgram: boolean; showActivity: boolean };

/** Each switch saves immediately (no "save" button to forget). */
export function PrivacyForm({ initial }: { initial: Privacy }) {
  const t = useTranslations('settings.privacy');
  const { toast } = useToast();
  const [values, setValues] = useState(initial);
  const [, startTransition] = useTransition();
  const change = (key: keyof Privacy, value: boolean) => {
    const next = { ...values, [key]: value };
    setValues(next);
    startTransition(async () => {
      const result = await updatePrivacyAction(next);
      if (result.ok) toast({ title: t('saved'), tone: 'success' });
      else {
        setValues(values);
        toast({ title: t('error'), tone: 'error' });
      }
    });
  };
  return (
    <div className="flex max-w-lg flex-col gap-5">
      {(['showFaculty', 'showProgram', 'showActivity'] as const).map((key) => (
        <Switch
          key={key}
          label={t(`${key}.label`)}
          description={t(`${key}.hint`)}
          checked={values[key]}
          onCheckedChange={(value) => change(key, value)}
        />
      ))}
    </div>
  );
}
