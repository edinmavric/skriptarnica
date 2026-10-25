'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { saveSettingsAction } from '@/server/actions/admin-panel';
import type { PlatformSettings } from '@/server/services/settings';

import { useReauth } from './reauth';

/**
 * Platform settings (SPEC §4.10, §14). Money is edited in RSD and percent for humans and
 * stored as integer para and basis points; every change is audited with before/after.
 */
export function SettingsForm({ initial }: { initial: PlatformSettings }) {
  const t = useTranslations('admin.settings');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const reauth = useReauth();
  const { toast } = useToast();
  const [values, setValues] = useState({
    commissionPercent: String(initial.commissionBasisPoints / 100),
    fundsHoldDays: String(initial.fundsHoldDays),
    minPayoutRsd: String(initial.minPayoutPara / 100),
    maxNotePriceRsd: String(initial.maxNotePricePara / 100),
    maxPdfSizeMb: String(Math.round(initial.maxPdfSizeBytes / 1024 / 1024)),
    previewPagesMax: String(initial.previewPagesMax),
    previewPagesPercent: String(Math.round(initial.previewPagesMaxRatio * 100)),
    purchaseProblemWindowDays: String(initial.purchaseProblemWindowDays),
    preModeratedNotesCount: String(initial.preModeratedNotesCount),
    maxCommunitiesPerUser: String(initial.maxCommunitiesPerUser),
    minAccountAgeDaysToCreateCommunity: String(initial.minAccountAgeDaysToCreateCommunity),
  });
  const [flags, setFlags] = useState(initial.featureFlags);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const num = (key: keyof typeof values) => Number(values[key].replace(',', '.'));
  const fields: { key: keyof typeof values; suffix?: string }[] = [
    { key: 'commissionPercent', suffix: '%' },
    { key: 'fundsHoldDays' },
    { key: 'minPayoutRsd', suffix: 'RSD' },
    { key: 'maxNotePriceRsd', suffix: 'RSD' },
    { key: 'maxPdfSizeMb', suffix: 'MB' },
    { key: 'previewPagesMax' },
    { key: 'previewPagesPercent', suffix: '%' },
    { key: 'purchaseProblemWindowDays' },
    { key: 'preModeratedNotesCount' },
    { key: 'maxCommunitiesPerUser' },
    { key: 'minAccountAgeDaysToCreateCommunity' },
  ];
  return (
    <form
      noValidate
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setError(null);
          const next: PlatformSettings = {
            commissionBasisPoints: Math.round(num('commissionPercent') * 100),
            fundsHoldDays: num('fundsHoldDays'),
            minPayoutPara: Math.round(num('minPayoutRsd') * 100),
            maxNotePricePara: Math.round(num('maxNotePriceRsd') * 100),
            maxPdfSizeBytes: Math.round(num('maxPdfSizeMb') * 1024 * 1024),
            previewPagesMax: num('previewPagesMax'),
            previewPagesMaxRatio: num('previewPagesPercent') / 100,
            purchaseProblemWindowDays: num('purchaseProblemWindowDays'),
            preModeratedNotesCount: num('preModeratedNotesCount'),
            maxCommunitiesPerUser: num('maxCommunitiesPerUser'),
            minAccountAgeDaysToCreateCommunity: num('minAccountAgeDaysToCreateCommunity'),
            featureFlags: flags,
          };
          const result = await reauth(() => saveSettingsAction(next));
          if (result.ok) {
            toast({ title: t('saved'), tone: 'success' });
            router.refresh();
          } else
            setError(
              Object.keys(result.error.fieldErrors ?? {}).length > 0
                ? t('invalid', { fields: Object.keys(result.error.fieldErrors ?? {}).join(', ') })
                : tAll(result.error.messageKey),
            );
        });
      }}
    >
      <FormAlert message={error} />
      {fields.map((field) => (
        <Field
          key={field.key}
          label={t(`fields.${field.key}`)}
          description={field.suffix ? t('unit', { unit: field.suffix }) : undefined}
        >
          <Input
            inputMode="decimal"
            value={values[field.key]}
            onChange={(event) =>
              setValues((current) => ({ ...current, [field.key]: event.target.value }))
            }
          />
        </Field>
      ))}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">{t('flags')}</legend>
        <Switch
          label={t('taxCalculation')}
          description={t('legalHint')}
          checked={flags.taxCalculation}
          onCheckedChange={(value) => setFlags((f) => ({ ...f, taxCalculation: value }))}
        />
        <Switch
          label={t('invoicing')}
          description={t('legalHint')}
          checked={flags.invoicing}
          onCheckedChange={(value) => setFlags((f) => ({ ...f, invoicing: value }))}
        />
      </fieldset>
      <Button type="submit" className="self-start" loading={pending}>
        {t('save')}
      </Button>
    </form>
  );
}
