'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { setCoursePlacementAction, setCourseProfessorAction } from '@/server/actions/admin-panel';

import type { Option } from './catalog-form';

/** Where the course sits in study programs (year/semester) and who teaches it. */
export function CourseLinks({
  courseId,
  placements,
  linkedProfessors,
  programs,
  professors,
}: {
  courseId: string;
  placements: {
    programId: string;
    program: string;
    year: number;
    semester: number;
    mandatory: boolean;
  }[];
  linkedProfessors: Option[];
  programs: Option[];
  professors: Option[];
}) {
  const t = useTranslations('admin.catalog.links');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [placement, setPlacement] = useState({
    programId: programs[0]?.id ?? '',
    year: '1',
    semester: '1',
    mandatory: true,
  });
  const [professorId, setProfessorId] = useState(professors[0]?.id ?? '');
  const act = (run: () => Promise<unknown>) =>
    startTransition(async () => {
      await run();
      router.refresh();
    });
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section aria-labelledby="placements-heading" className="flex flex-col gap-3">
        <h2 id="placements-heading" className="text-display-sm font-semibold">
          {t('programs')}
        </h2>
        <ul className="divide-y divide-rule border-y border-rule text-sm">
          {placements.map((row) => (
            <li key={row.programId} className="flex items-center justify-between gap-2 py-2">
              <span>
                {t('placement', {
                  program: row.program,
                  year: row.year,
                  semester: row.semester,
                  mandatory: row.mandatory ? 'yes' : 'no',
                })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  act(() =>
                    setCoursePlacementAction({
                      courseId,
                      programId: row.programId,
                      year: row.year,
                      semester: row.semester,
                      mandatory: row.mandatory,
                      remove: true,
                    }),
                  )
                }
              >
                {t('remove')}
              </Button>
            </li>
          ))}
          {placements.length === 0 ? (
            <li className="py-2 text-ink-muted">{t('noPrograms')}</li>
          ) : null}
        </ul>
        {programs.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('program')} className="col-span-2">
              <Select
                value={placement.programId}
                onChange={(event) => setPlacement((p) => ({ ...p, programId: event.target.value }))}
              >
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('year')}>
              <Input
                inputMode="numeric"
                value={placement.year}
                onChange={(event) => setPlacement((p) => ({ ...p, year: event.target.value }))}
              />
            </Field>
            <Field label={t('semester')}>
              <Input
                inputMode="numeric"
                value={placement.semester}
                onChange={(event) => setPlacement((p) => ({ ...p, semester: event.target.value }))}
              />
            </Field>
            <Checkbox
              className="col-span-2"
              checked={placement.mandatory}
              onCheckedChange={(value) =>
                setPlacement((p) => ({ ...p, mandatory: value === true }))
              }
              label={t('mandatory')}
            />
            <Button
              className="col-span-2 justify-self-start"
              variant="secondary"
              loading={pending}
              onClick={() =>
                act(() =>
                  setCoursePlacementAction({
                    courseId,
                    programId: placement.programId,
                    year: Number(placement.year),
                    semester: Number(placement.semester),
                    mandatory: placement.mandatory,
                    remove: false,
                  }),
                )
              }
            >
              {t('addProgram')}
            </Button>
          </div>
        ) : null}
      </section>
      <section aria-labelledby="professors-heading" className="flex flex-col gap-3">
        <h2 id="professors-heading" className="text-display-sm font-semibold">
          {t('professors')}
        </h2>
        <ul className="divide-y divide-rule border-y border-rule text-sm">
          {linkedProfessors.map((professor) => (
            <li key={professor.id} className="flex items-center justify-between gap-2 py-2">
              <span>{professor.label}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  act(() =>
                    setCourseProfessorAction({ courseId, professorId: professor.id, remove: true }),
                  )
                }
              >
                {t('remove')}
              </Button>
            </li>
          ))}
          {linkedProfessors.length === 0 ? (
            <li className="py-2 text-ink-muted">{t('noProfessors')}</li>
          ) : null}
        </ul>
        {professors.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('professor')} className="min-w-56 flex-1">
              <Select value={professorId} onChange={(event) => setProfessorId(event.target.value)}>
                {professors.map((professor) => (
                  <option key={professor.id} value={professor.id}>
                    {professor.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="secondary"
              loading={pending}
              onClick={() =>
                act(() => setCourseProfessorAction({ courseId, professorId, remove: false }))
              }
            >
              {t('addProfessor')}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
