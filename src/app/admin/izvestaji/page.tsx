import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

/** CSV reports for accounting (SPEC §4.10). A plain GET form: the browser downloads the file. */
export default async function AdminExportsPage() {
  const t = await getTranslations('admin.exports');
  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <p className="max-w-prose text-ink-muted">{t('intro')}</p>
      <form action="/admin/izvestaji/preuzmi" method="get" className="flex max-w-xl flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('kind')}</span>
          <Select name="vrsta" defaultValue="porudzbine">
            <option value="porudzbine">{t('kinds.porudzbine')}</option>
            <option value="isplate">{t('kinds.isplate')}</option>
            <option value="knjizenja">{t('kinds.knjizenja')}</option>
          </Select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('from')}</span>
            <Input type="date" name="od" defaultValue={monthStart} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('to')}</span>
            <Input type="date" name="do" defaultValue={today.toISOString().slice(0, 10)} required />
          </label>
        </div>
        <Button type="submit" className="self-start">
          {t('download')}
        </Button>
      </form>
    </div>
  );
}
