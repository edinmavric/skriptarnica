'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

export default function CookieSettingsDialog({
  open,
  onOpenChange,
  analytics,
  onAnalyticsChange,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analytics: boolean;
  onAnalyticsChange: (value: boolean) => void;
  pending: boolean;
  onSave: () => void;
}) {
  const t = useTranslations('consent');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('settingsTitle')}
      description={t('settingsDescription')}
      footer={
        <Button loading={pending} onClick={onSave}>
          {t('save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Switch label={t('necessary')} description={t('necessaryHint')} checked disabled />
        <Switch
          label={t('analytics')}
          description={t('analyticsHint')}
          checked={analytics}
          onCheckedChange={onAnalyticsChange}
        />
        <p className="text-sm text-ink-muted">{t('noMarketing')}</p>
      </div>
    </Dialog>
  );
}
