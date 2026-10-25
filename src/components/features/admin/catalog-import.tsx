'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { TableScroll } from '@/components/ui/table-scroll';
import { importCoursesAction } from '@/server/actions/admin-panel';
import type { ImportRowResult } from '@/server/services/admin/catalog-admin';

import { useReauth } from './reauth';

/** Paste or pick a CSV → preview (dry run) → import. Rows with errors are skipped, not fatal. */
export function CatalogImport() {
  const t = useTranslations('admin.import');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const reauth = useReauth();
  const [csv, setCsv] = useState('');
  const [rows, setRows] = useState<ImportRowResult[] | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (dryRun: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await reauth(() => importCoursesAction({ csv, dryRun }));
      if (!result.ok) {
        setError(tAll(result.error.messageKey));
        return;
      }
      setRows(result.value.rows);
      setDone(!dryRun);
    });
  return (
    <div className="flex flex-col gap-4">
      <FormAlert message={error} />
      {done ? <FormAlert tone="success" message={t('done')} /> : null}
      <label className="flex w-fit cursor-pointer flex-col gap-1 text-sm">
        <span className="font-medium">{t('file')}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="text-sm"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) setCsv(await file.text());
            setRows(null);
            setDone(false);
          }}
        />
      </label>
      <Field label={t('paste')} description={t('format')}>
        <Textarea
          rows={8}
          className="font-mono text-xs"
          value={csv}
          onChange={(event) => {
            setCsv(event.target.value);
            setRows(null);
            setDone(false);
          }}
        />
      </Field>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          loading={pending}
          disabled={!csv.trim()}
          onClick={() => run(true)}
        >
          {t('preview')}
        </Button>
        <Button
          loading={pending}
          disabled={!rows || done || rows.every((row) => row.status === 'error')}
          onClick={() => run(false)}
        >
          {t('import')}
        </Button>
      </div>
      {rows ? (
        <TableScroll label={t('result')}>
          <p className="mb-2 text-sm">
            {t('summary', {
              created: rows.filter((r) => r.status === 'created').length,
              updated: rows.filter((r) => r.status === 'updated').length,
              errors: rows.filter((r) => r.status === 'error').length,
            })}
          </p>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-rule text-ink-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">{t('line')}</th>
                <th className="py-2 pr-3 font-medium">{t('course')}</th>
                <th className="py-2 font-medium">{t('result')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.map((row) => (
                <tr key={row.line}>
                  <td className="tabular py-2 pr-3">{row.line}</td>
                  <td className="py-2 pr-3">{row.course}</td>
                  <td className="py-2">
                    <Badge
                      tone={
                        row.status === 'error'
                          ? 'danger'
                          : row.status === 'created'
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {t(`status.${row.status}`)}
                    </Badge>
                    {row.errorKey ? <span className="ml-2">{tAll(row.errorKey)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : null}
    </div>
  );
}
