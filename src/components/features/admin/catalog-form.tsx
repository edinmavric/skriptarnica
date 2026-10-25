'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import type { CatalogEntityType } from '@/lib/validation/admin';
import {
  approveCatalogRequestAction,
  deleteCatalogItemAction,
  saveCatalogItemAction,
} from '@/server/actions/admin-panel';

import { useReauth } from './reauth';

type FieldKind = 'text' | 'number' | 'university' | 'faculty' | 'level';

const fieldsByType: Record<
  CatalogEntityType,
  { name: string; kind: FieldKind; required?: boolean }[]
> = {
  university: [
    { name: 'name', kind: 'text', required: true },
    { name: 'shortName', kind: 'text', required: true },
    { name: 'city', kind: 'text', required: true },
    { name: 'emailDomains', kind: 'text' },
    { name: 'slug', kind: 'text' },
  ],
  faculty: [
    { name: 'universityId', kind: 'university', required: true },
    { name: 'name', kind: 'text', required: true },
    { name: 'shortName', kind: 'text', required: true },
    { name: 'city', kind: 'text', required: true },
    { name: 'emailDomains', kind: 'text' },
    { name: 'slug', kind: 'text' },
  ],
  program: [
    { name: 'facultyId', kind: 'faculty', required: true },
    { name: 'name', kind: 'text', required: true },
    { name: 'level', kind: 'level', required: true },
    { name: 'durationYears', kind: 'number', required: true },
    { name: 'slug', kind: 'text' },
  ],
  course: [
    { name: 'facultyId', kind: 'faculty', required: true },
    { name: 'name', kind: 'text', required: true },
    { name: 'code', kind: 'text' },
    { name: 'ects', kind: 'number' },
    { name: 'slug', kind: 'text' },
  ],
  professor: [
    { name: 'facultyId', kind: 'faculty', required: true },
    { name: 'name', kind: 'text', required: true },
    { name: 'title', kind: 'text' },
    { name: 'slug', kind: 'text' },
  ],
};

export interface Option {
  id: string;
  label: string;
}

/**
 * One form for every catalog entity (create, edit, or approving a catalog request with the
 * admin's corrections). Field errors come back from the shared zod schemas.
 */
export function CatalogForm({
  type,
  id,
  initial,
  universities,
  faculties,
  requestId,
  onDone,
}: {
  type: CatalogEntityType;
  id?: string;
  initial: Record<string, string>;
  universities: Option[];
  faculties: Option[];
  requestId?: string;
  onDone?: () => void;
}) {
  const t = useTranslations('admin.catalog');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const reauth = useReauth();
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = fieldsByType[type];

  function submit() {
    startTransition(async () => {
      setErrors({});
      setFormError(null);
      const result = requestId
        ? await approveCatalogRequestAction({ requestId, type, values })
        : await saveCatalogItemAction({ type, ...(id ? { id } : {}), values });
      if (result.ok) {
        toast({ title: t('saved'), tone: 'success' });
        onDone?.();
        if (!id && !requestId) router.push(`/admin/katalog/${type}/${result.value.id}`);
        else router.refresh();
        return;
      }
      const fieldErrors = Object.fromEntries(
        Object.entries(result.error.fieldErrors ?? {}).map(([key, list]) => [
          key,
          tAll(list[0] ?? ''),
        ]),
      );
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setFormError(tAll(result.error.messageKey));
    });
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex max-w-xl flex-col gap-4"
    >
      <FormAlert message={formError} />
      {fields.map((field) => {
        const common = {
          value: values[field.name] ?? '',
          onChange: (event: { target: { value: string } }) =>
            setValues((current) => ({ ...current, [field.name]: event.target.value })),
        };
        return (
          <Field
            key={field.name}
            label={t(`fields.${field.name as 'name'}`)}
            description={
              field.name === 'slug'
                ? t('slugHint')
                : field.name === 'emailDomains'
                  ? t('domainsHint')
                  : undefined
            }
            error={errors[field.name]}
            required={field.required}
          >
            {field.kind === 'university' || field.kind === 'faculty' ? (
              <Select {...common}>
                <option value="">{t('choose')}</option>
                {(field.kind === 'university' ? universities : faculties).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : field.kind === 'level' ? (
              <Select {...common}>
                {(['oas', 'mas', 'das', 'oss'] as const).map((level) => (
                  <option key={level} value={level}>
                    {t(`levels.${level}`)}
                  </option>
                ))}
              </Select>
            ) : (
              <Input inputMode={field.kind === 'number' ? 'numeric' : undefined} {...common} />
            )}
          </Field>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          {requestId ? t('approveRequest') : id ? t('save') : t('create')}
        </Button>
        {id ? (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await reauth(() => deleteCatalogItemAction({ type, id }));
                if (result.ok) {
                  toast({ title: t('deleted'), tone: 'success' });
                  router.push(`/admin/katalog?tip=${type}`);
                } else toast({ title: tAll(result.error.messageKey), tone: 'error' });
              })
            }
          >
            {t('delete')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
