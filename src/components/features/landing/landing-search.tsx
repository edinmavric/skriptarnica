'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { SearchBox } from '@/components/features/search/search-box';
import { Select } from '@/components/ui/select';

/** "Nađi skriptu za svoj predmet" with a faculty selector that narrows suggestions. */
export function LandingSearch({
  faculties,
}: {
  faculties: { slug: string; name: string; shortName: string; city: string }[];
}) {
  const t = useTranslations('landing');
  const id = useId();
  const [faculty, setFaculty] = useState<string>('');
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="sm:w-56">
        <label htmlFor={id} className="sr-only">
          {t('facultyLabel')}
        </label>
        <Select
          id={id}
          value={faculty}
          onChange={(event) => setFaculty(event.target.value)}
          className="min-h-14 text-base"
        >
          <option value="">{t('allFaculties')}</option>
          {faculties.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.shortName}, {item.city}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex-1">
        <SearchBox size="lg" facultySlug={faculty || null} label={t('searchLabel')} />
      </div>
    </div>
  );
}
