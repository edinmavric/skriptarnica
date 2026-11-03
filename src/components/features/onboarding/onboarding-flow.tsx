'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { useActionForm } from '@/components/forms/use-action-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { matchPrograms } from '@/lib/search/programs';
import { studentEmailSchema, usernameStepSchema } from '@/lib/validation/onboarding';
import {
  joinCommunitiesAction,
  listProgramsAction,
  requestStudentEmailAction,
  saveCoursesStepAction,
  saveProgramStepAction,
  setUsernameAction,
  skipStepAction,
} from '@/server/actions/onboarding';

import {
  CourseProposalDialog,
  type CourseProposalTarget,
} from '@/components/features/courses/course-proposal-dialog';

import { CatalogRequestDialog } from './catalog-request-dialog';
import { useProgramSearchList } from './use-program-search-list';

type Step = 'username' | 'program' | 'courses' | 'communities' | 'verify';

export interface OnboardingData {
  step: Step;
  needsUsername: boolean;
  universities: {
    id: string;
    name: string;
    shortName: string;
    city: string;
    faculties: { id: string; name: string; shortName: string; city: string }[];
  }[];
  /** The student's program, for suggesting a missing course (courses step only). */
  proposal: CourseProposalTarget | null;
  profile: {
    universityId: string | null;
    facultyId: string | null;
    programId: string | null;
    year: number | null;
  };
  programs: { id: string; name: string; durationYears: number }[];
  communities: {
    id: string;
    name: string;
    type: 'university' | 'faculty' | 'program' | 'course' | 'professor' | 'exam' | 'general';
    memberCount: number;
    joined: boolean;
  }[];
  courses: { id: string; name: string; code: string | null; year: number; semester: number }[];
  statuses: { courseId: string; status: 'enrolled' | 'passed'; grade: number | null }[];
  studentVerified: boolean;
}

function Stepper({ steps, current }: { steps: Step[]; current: Step }) {
  const t = useTranslations('onboarding.steps');
  const index = steps.indexOf(current);
  return (
    <ol className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t('label')}>
      {steps.map((step, i) => (
        <li
          key={step}
          aria-current={step === current ? 'step' : undefined}
          className={cn(
            'flex items-center gap-2 text-sm',
            i === index ? 'font-semibold text-ink' : 'text-ink-muted',
          )}
        >
          <span
            className={cn(
              'tabular grid size-7 place-items-center rounded-full border-[1.5px] text-[0.8rem]',
              i < index && 'border-pen bg-pen text-pen-ink',
              i === index && 'border-ink bg-marker text-marker-ink',
              i > index && 'border-field',
            )}
          >
            {i + 1}
          </span>
          {t(step)}
        </li>
      ))}
    </ol>
  );
}

function UsernameStep({ onDone }: { onDone: () => void }) {
  const t = useTranslations('onboarding.username');
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: usernameStepSchema,
    action: setUsernameAction,
    defaultValues: { username: '' },
    onSuccess: onDone,
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
      <FormAlert message={formError} />
      <Field label={t('label')} description={t('hint')} error={fieldError('username')}>
        <Input autoCapitalize="none" spellCheck={false} {...form.register('username')} />
      </Field>
      <Button type="submit" loading={submitting} className="self-start">
        {t('submit')}
      </Button>
    </form>
  );
}

function ProgramStep({ data, onDone }: { data: OnboardingData; onDone: () => void }) {
  const t = useTranslations('onboarding.program');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const [universityId, setUniversityId] = useState<string | null>(data.profile.universityId);
  const [facultyId, setFacultyId] = useState<string | null>(data.profile.facultyId);
  const [programId, setProgramId] = useState<string | null>(data.profile.programId);
  const [year, setYear] = useState<number>(data.profile.year ?? 1);
  const [programs, setPrograms] = useState(data.programs);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const university = data.universities.find((u) => u.id === universityId) ?? null;
  const universityOptions = useMemo(
    () =>
      data.universities.map((u) => ({
        value: u.id,
        label: u.name,
        description: u.city,
        keywords: u.shortName,
      })),
    [data.universities],
  );
  const facultyOptions = useMemo(
    () =>
      (university?.faculties ?? []).map((f) => ({
        value: f.id,
        label: f.name,
        description: f.city,
        keywords: f.shortName,
      })),
    [university],
  );
  const program = programs.find((p) => p.id === programId) ?? null;
  const [programQuery, setProgramQuery] = useState('');
  const searchList = useProgramSearchList();
  const matches = useMemo(
    () => (searchList.programs ? matchPrograms(searchList.programs, programQuery) : []),
    [searchList.programs, programQuery],
  );
  const searching =
    searchList.programs === null && !searchList.failed && programQuery.trim().length > 1;

  function pickMatch(match: (typeof matches)[number]) {
    setUniversityId(match.universityId);
    setFacultyId(match.facultyId);
    setProgramId(match.programId);
    setFieldErrors({});
    void loadPrograms(match.facultyId);
  }

  async function loadPrograms(nextFacultyId: string) {
    setLoadingPrograms(true);
    const result = await listProgramsAction({ facultyId: nextFacultyId });
    setLoadingPrograms(false);
    setPrograms(result.ok ? result.value : []);
  }

  function submit() {
    setError(null);
    const missing: Record<string, string> = {};
    if (!universityId) missing.universityId = tAll('validation.universityRequired');
    if (!facultyId) missing.facultyId = tAll('validation.facultyRequired');
    if (!programId) missing.programId = tAll('validation.programRequired');
    setFieldErrors(missing);
    if (!universityId || !facultyId || !programId) {
      document.getElementById(Object.keys(missing).map((k) => `ob-${k}`)[0] ?? '')?.focus();
      return;
    }
    startTransition(async () => {
      const result = await saveProgramStepAction({ universityId, facultyId, programId, year });
      if (result.ok) onDone();
      else {
        const errors = Object.fromEntries(
          Object.entries(result.error.fieldErrors ?? {}).map(([k, v]) => [k, tAll(v[0] ?? '')]),
        );
        setFieldErrors(errors);
        if (Object.keys(errors).length === 0) setError(tAll(result.error.messageKey));
      }
    });
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <FormAlert message={error} />
      <Field label={t('search')} description={t('searchHint')} id="ob-search">
        <Combobox
          options={matches.map((match) => ({
            value: match.programId,
            label: match.programName,
            description: `${match.facultyShortName}, ${match.universityName}`,
          }))}
          value={null}
          placeholder={t('searchPlaceholder')}
          onQueryChange={setProgramQuery}
          loading={searching}
          emptyMessage={t('searchEmpty')}
          onChange={(value) => {
            const match = matches.find((candidate) => candidate.programId === value);
            if (match) pickMatch(match);
          }}
        />
      </Field>
      <p className="text-sm text-ink-muted">{t('orStepByStep')}</p>
      <Field label={t('university')} error={fieldErrors.universityId} id="ob-universityId">
        <Combobox
          options={universityOptions}
          value={universityId}
          placeholder={t('universityPlaceholder')}
          onChange={(value) => {
            setUniversityId(value);
            setFacultyId(null);
            setProgramId(null);
            setPrograms([]);
          }}
        />
      </Field>
      <Field label={t('faculty')} error={fieldErrors.facultyId} id="ob-facultyId">
        <Combobox
          options={facultyOptions}
          value={facultyId}
          disabled={!universityId}
          placeholder={t('facultyPlaceholder')}
          onChange={(value) => {
            setFacultyId(value);
            setProgramId(null);
            if (value) void loadPrograms(value);
          }}
        />
      </Field>
      <Field label={t('program')} error={fieldErrors.programId} id="ob-programId">
        <Combobox
          options={programs.map((p) => ({ value: p.id, label: p.name }))}
          value={programId}
          disabled={!facultyId}
          loading={loadingPrograms}
          placeholder={t('programPlaceholder')}
          onChange={(value) => setProgramId(value)}
        />
      </Field>
      <Field label={t('year')} error={fieldErrors.year} id="ob-year">
        <Select value={year} onChange={(event) => setYear(Number(event.target.value))}>
          {Array.from({ length: program?.durationYears ?? 6 }, (_, i) => i + 1).map((y) => (
            <option key={y} value={y}>
              {t('yearOption', { year: y })}
            </option>
          ))}
        </Select>
      </Field>
      <CatalogRequestDialog universityId={universityId} facultyId={facultyId} />
      <Button onClick={submit} loading={pending} className="self-start">
        {t('submit')}
      </Button>
    </div>
  );
}

type Mark = 'none' | 'enrolled' | 'passed';

function CoursesStep({ data, onDone }: { data: OnboardingData; onDone: () => void }) {
  const t = useTranslations('onboarding.courses');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const currentYear = data.profile.year ?? 1;
  const initial = useMemo(() => {
    const map = new Map<string, { mark: Mark; grade: number | null }>();
    for (const course of data.courses) {
      const existing = data.statuses.find((s) => s.courseId === course.id);
      if (existing) map.set(course.id, { mark: existing.status, grade: existing.grade });
      else if (data.statuses.length === 0) {
        // Suggestion: this year's courses are being taken, earlier years' are passed.
        map.set(course.id, {
          mark:
            course.year === currentYear
              ? 'enrolled'
              : course.year < currentYear
                ? 'passed'
                : 'none',
          grade: null,
        });
      } else map.set(course.id, { mark: 'none', grade: null });
    }
    return map;
  }, [data.courses, data.statuses, currentYear]);
  const [marks, setMarks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byYear = useMemo(() => {
    const groups = new Map<number, OnboardingData['courses']>();
    for (const course of data.courses)
      groups.set(course.year, [...(groups.get(course.year) ?? []), course]);
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [data.courses]);

  function setMark(courseId: string, mark: Mark) {
    setMarks((current) =>
      new Map(current).set(courseId, { mark, grade: current.get(courseId)?.grade ?? null }),
    );
  }
  function setGrade(courseId: string, grade: number | null) {
    setMarks((current) => new Map(current).set(courseId, { mark: 'passed', grade }));
  }

  function submit() {
    setError(null);
    const enrolled: string[] = [];
    const passed: { courseId: string; grade: number | null }[] = [];
    for (const [courseId, value] of marks) {
      if (value.mark === 'enrolled') enrolled.push(courseId);
      if (value.mark === 'passed') passed.push({ courseId, grade: value.grade });
    }
    startTransition(async () => {
      const result = await saveCoursesStepAction({ enrolled, passed, advance: true });
      if (result.ok) onDone();
      else setError(tAll(result.error.messageKey));
    });
  }

  if (data.courses.length === 0) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-ink-muted">{t('empty')}</p>
        {data.proposal ? (
          <CourseProposalDialog target={data.proposal} trigger="button" />
        ) : (
          <CatalogRequestDialog
            universityId={data.profile.universityId}
            facultyId={data.profile.facultyId}
            defaultType="course"
          />
        )}
        <Button
          onClick={() =>
            startTransition(async () => {
              await skipStepAction({ to: 'verify' });
              onDone();
            })
          }
          loading={pending}
          className="self-start"
        >
          {t('continue')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <FormAlert message={error} />
      <p className="text-ink-muted">{t('intro')}</p>
      {byYear.map(([year, list]) => (
        <section key={year} aria-labelledby={`year-${year}`}>
          <h3 id={`year-${year}`} className="mb-2 font-sans text-base font-semibold">
            {t('year', { year })}
          </h3>
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {list.map((course) => {
              const value = marks.get(course.id) ?? { mark: 'none' as Mark, grade: null };
              return (
                <li
                  key={course.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    {course.name}
                    {course.code ? (
                      <span className="ml-2 font-mono text-sm text-ink-muted">{course.code}</span>
                    ) : null}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <fieldset className="flex rounded-md border border-field p-0.5">
                      <legend className="sr-only">{t('statusFor', { course: course.name })}</legend>
                      {(['none', 'enrolled', 'passed'] as const).map((mark) => (
                        <label
                          key={mark}
                          className={cn(
                            'relative flex min-h-10 cursor-pointer items-center rounded-sm px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-pen',
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
                            onChange={() => setMark(course.id, mark)}
                          />
                          {t(`marks.${mark}`)}
                        </label>
                      ))}
                    </fieldset>
                    {value.mark === 'passed' ? (
                      <label className="flex items-center gap-2 text-sm">
                        <span className="sr-only">{t('gradeFor', { course: course.name })}</span>
                        <select
                          className="min-h-10 rounded-md border border-field bg-paper-raised px-2"
                          value={value.grade ?? ''}
                          onChange={(event) =>
                            setGrade(
                              course.id,
                              event.target.value ? Number(event.target.value) : null,
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
                      </label>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {data.proposal ? (
        <CourseProposalDialog target={data.proposal} />
      ) : (
        <CatalogRequestDialog
          universityId={data.profile.universityId}
          facultyId={data.profile.facultyId}
          defaultType="course"
        />
      )}
      <Button onClick={submit} loading={pending} className="self-start">
        {t('submit')}
      </Button>
    </div>
  );
}

function CommunitiesStep({
  communities,
  onDone,
}: {
  communities: OnboardingData['communities'];
  onDone: () => void;
}) {
  const t = useTranslations('onboarding.communities');
  const tTypes = useTranslations('forum.community.types');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(communities.filter((c) => !c.joined).map((c) => c.id)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const join = () =>
    startTransition(async () => {
      const result = await joinCommunitiesAction({ communityIds: [...chosen] });
      if (result.ok) onDone();
      else setError(tAll(result.error.messageKey));
    });

  if (communities.length === 0) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-ink-muted">{t('none')}</p>
        <Button onClick={join} loading={pending} className="self-start">
          {t('continue')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-ink-muted">{t('intro')}</p>
      <FormAlert message={error} />
      <ul className="divide-y divide-rule border-y border-rule">
        {communities.map((community) => (
          <li key={community.id}>
            <label
              className={cn(
                'flex min-h-14 items-center gap-3 py-2',
                community.joined ? 'cursor-default' : 'cursor-pointer',
              )}
            >
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-pen"
                checked={community.joined || chosen.has(community.id)}
                disabled={community.joined}
                onChange={() => toggle(community.id)}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{community.name}</span>
                <span className="text-sm text-ink-muted">
                  {community.joined
                    ? t('alreadyMember')
                    : t('members', { count: community.memberCount })}
                </span>
              </span>
              <Badge tone="outline" className="shrink-0">
                {tTypes(community.type)}
              </Badge>
            </label>
          </li>
        ))}
      </ul>
      <Button onClick={join} loading={pending} className="self-start">
        {chosen.size > 0 ? t('join', { count: chosen.size }) : t('continue')}
      </Button>
    </div>
  );
}

function VerifyStep({ verified, onDone }: { verified: boolean; onDone: () => void }) {
  const t = useTranslations('onboarding.verify');
  const [sent, setSent] = useState(false);
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: studentEmailSchema,
    action: requestStudentEmailAction,
    defaultValues: { email: '' },
    onSuccess: () => setSent(true),
  });
  const [pending, startTransition] = useTransition();
  const finish = () =>
    startTransition(async () => {
      await skipStepAction({ to: 'done' });
      onDone();
    });
  return (
    <div className="flex max-w-md flex-col gap-4">
      {verified ? (
        <p className="flex items-center gap-2">
          <Badge tone="marker">{t('verifiedBadge')}</Badge> {t('alreadyVerified')}
        </p>
      ) : sent ? (
        <FormAlert tone="success" message={t('sent')} />
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <p className="text-ink-muted">{t('intro')}</p>
          <FormAlert message={formError} />
          <Field label={t('email')} description={t('hint')} error={fieldError('email')}>
            <Input type="email" autoComplete="email" {...form.register('email')} />
          </Field>
          <Button type="submit" variant="secondary" loading={submitting} className="self-start">
            {t('send')}
          </Button>
        </form>
      )}
      <Button onClick={finish} loading={pending} className="self-start">
        {verified || sent ? t('finish') : t('skip')}
      </Button>
    </div>
  );
}

export function OnboardingFlow({ data }: { data: OnboardingData }) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const steps: Step[] = [
    ...(data.needsUsername ? (['username'] as const) : []),
    'program',
    'courses',
    'communities',
    'verify',
  ];
  const refresh = () => router.refresh();
  const nextAfter: Record<Step, 'courses' | 'communities' | 'verify' | 'done'> = {
    username: 'courses',
    program: 'courses',
    courses: 'communities',
    communities: 'verify',
    verify: 'done',
  };

  return (
    <div className="flex flex-col gap-6">
      <Stepper steps={steps} current={data.step} />
      <section aria-labelledby="step-title" className="flex flex-col gap-4">
        <h2 id="step-title" className="text-display-sm font-semibold">
          {t(`titles.${data.step}`)}
        </h2>
        {data.step === 'username' ? <UsernameStep onDone={refresh} /> : null}
        {data.step === 'program' ? <ProgramStep data={data} onDone={refresh} /> : null}
        {data.step === 'courses' ? <CoursesStep data={data} onDone={refresh} /> : null}
        {data.step === 'communities' ? (
          <CommunitiesStep communities={data.communities} onDone={refresh} />
        ) : null}
        {data.step === 'verify' ? (
          <VerifyStep verified={data.studentVerified} onDone={() => router.push('/')} />
        ) : null}
      </section>
      {data.step !== 'verify' && data.step !== 'username' ? (
        <Button
          variant="ghost"
          className="self-start"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              await skipStepAction({ to: nextAfter[data.step] });
              refresh();
            })
          }
        >
          {t('skipStep')}
        </Button>
      ) : null}
    </div>
  );
}
