'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { saveCoursesStepAction, setCourseProfessorAction } from '@/server/actions/onboarding';

type Mark = 'none' | 'enrolled' | 'passed';
interface CourseRow {
  id: string;
  name: string;
  code: string | null;
  year: number | null;
  status: 'enrolled' | 'passed' | null;
  grade: number | null;
  professorId: string | null;
  professors: { id: string; name: string }[];
}

/** Edit enrolled/passed marks (and your professor) — drives recommendations (SPEC §4.5). */
export function MyCourses({ courses }: { courses: CourseRow[] }) {
  const t = useTranslations('myCourses');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [marks, setMarks] = useState(
    () =>
      new Map(courses.map((c) => [c.id, { mark: (c.status ?? 'none') as Mark, grade: c.grade }])),
  );
  const [professors, setProfessors] = useState(
    () => new Map(courses.map((c) => [c.id, c.professorId ?? ''])),
  );
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const enrolled: string[] = [];
    const passed: { courseId: string; grade: number | null }[] = [];
    for (const [courseId, value] of marks) {
      if (value.mark === 'enrolled') enrolled.push(courseId);
      if (value.mark === 'passed') passed.push({ courseId, grade: value.grade });
    }
    startTransition(async () => {
      const result = await saveCoursesStepAction({ enrolled, passed, advance: false });
      if (!result.ok) {
        setMessage({ tone: 'error', text: tAll(result.error.messageKey) });
        return;
      }
      for (const courseId of enrolled) {
        const professorId = professors.get(courseId) || null;
        const original = courses.find((c) => c.id === courseId)?.professorId ?? null;
        if (professorId !== original) await setCourseProfessorAction({ courseId, professorId });
      }
      setMessage({ tone: 'success', text: t('saved') });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormAlert tone={message?.tone ?? 'success'} message={message?.text ?? null} />
      <ul className="divide-y divide-rule border-y border-rule">
        {courses.map((course) => {
          const value = marks.get(course.id) ?? { mark: 'none' as Mark, grade: null };
          return (
            <li
              key={course.id}
              className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <span>
                {course.name}
                {course.year ? (
                  <span className="ml-2 text-sm text-ink-muted">
                    {t('year', { year: course.year })}
                  </span>
                ) : null}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <fieldset className="flex rounded-md border border-field p-0.5">
                  <legend className="sr-only">{t('statusFor', { course: course.name })}</legend>
                  {(['none', 'enrolled', 'passed'] as const).map((mark) => (
                    <label
                      key={mark}
                      className={cn(
                        'flex min-h-10 cursor-pointer items-center rounded-sm px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-pen',
                        value.mark === mark
                          ? mark === 'none'
                            ? 'bg-paper-sunk font-medium'
                            : 'bg-pen font-medium text-pen-ink'
                          : 'text-ink-muted',
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={`mark-${course.id}`}
                        checked={value.mark === mark}
                        onChange={() =>
                          setMarks((m) => new Map(m).set(course.id, { mark, grade: value.grade }))
                        }
                      />
                      {t(`marks.${mark}`)}
                    </label>
                  ))}
                </fieldset>
                {value.mark === 'passed' ? (
                  <select
                    aria-label={t('gradeFor', { course: course.name })}
                    className="min-h-10 rounded-md border border-field bg-paper-raised px-2 text-sm"
                    value={value.grade ?? ''}
                    onChange={(event) =>
                      setMarks((m) =>
                        new Map(m).set(course.id, {
                          mark: 'passed',
                          grade: event.target.value ? Number(event.target.value) : null,
                        }),
                      )
                    }
                  >
                    <option value="">{t('gradeOptional')}</option>
                    {[6, 7, 8, 9, 10].map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                ) : null}
                {value.mark === 'enrolled' && course.professors.length > 0 ? (
                  <select
                    aria-label={t('professorFor', { course: course.name })}
                    className="min-h-10 rounded-md border border-field bg-paper-raised px-2 text-sm"
                    value={professors.get(course.id) ?? ''}
                    onChange={(event) =>
                      setProfessors((p) => new Map(p).set(course.id, event.target.value))
                    }
                  >
                    <option value="">{t('professorAny')}</option>
                    {course.professors.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <Button onClick={save} loading={pending} className="self-start">
        {t('save')}
      </Button>
    </div>
  );
}
