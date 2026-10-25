'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { FileDropzone, type UploadStatus } from '@/components/ui/file-dropzone';
import { Input, Textarea } from '@/components/ui/input';
import { PriceTag } from '@/components/ui/price-tag';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PARA_PER_RSD } from '@/config/constants';
import { examPeriodKeys } from '@/config/exam-periods';
import { routes } from '@/config/routes';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
import { calculateCommission } from '@/lib/money';
import type { AppError } from '@/lib/result';
import { MIN_HOW_I_STUDIED } from '@/lib/validation/notes';
import { listCourseProfessorsAction, renderMarkdownAction } from '@/server/actions/editor';
import {
  acceptDeclarationAction,
  confirmUploadAction,
  publishNoteAction,
  requestUploadAction,
  saveNoteCourseAction,
  saveNoteDescriptionAction,
  saveNotePriceAction,
  versionStatusAction,
} from '@/server/actions/notes';
import type { ProcessingStatus } from '@/server/services/notes';

export interface WizardNote {
  id: string;
  courseId: string | null;
  courseLabel: string | null;
  professorId: string | null;
  title: string;
  shortDescription: string;
  howIStudied: string;
  grade: number | null;
  academicYear: string | null;
  examPeriod: string | null;
  language: 'sr_latn' | 'sr_cyrl' | 'en' | 'other';
  tags: string[];
  pricePara: number;
  declarationAccepted: boolean;
  wizardStep: number;
  status: string;
}

const STEPS = [
  'course',
  'upload',
  'processing',
  'description',
  'price',
  'declaration',
  'review',
] as const;
type StepKey = (typeof STEPS)[number];

function useMessage() {
  const t = useTranslations() as unknown as (
    key: string,
    values?: Record<string, number>,
  ) => string;
  return (key: string) => {
    const [messageKey, param] = key.split('|');
    return t(messageKey ?? key, param ? { n: Number(param) } : {});
  };
}

function firstError(error: AppError, field?: string): string {
  if (field && error.fieldErrors?.[field]?.[0]) return error.fieldErrors[field][0];
  const any = Object.values(error.fieldErrors ?? {})[0]?.[0];
  return any ?? error.messageKey;
}

function Stepper({
  current,
  reached,
  noteId,
}: {
  current: number;
  reached: number;
  noteId: string | null;
}) {
  const t = useTranslations('seller.wizard.steps');
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-2 sm:gap-x-4" aria-label={t('label')}>
      {STEPS.map((step, index) => {
        const number = index + 1;
        const reachable = noteId !== null && number <= reached;
        const content = (
          <>
            <span
              className={cn(
                'tabular grid size-7 place-items-center rounded-full border-[1.5px] text-[0.8rem]',
                number < current && 'border-pen bg-pen text-pen-ink',
                number === current && 'border-ink bg-marker text-marker-ink',
                number > current && 'border-field',
              )}
            >
              {number}
            </span>
            {/* On phones only the current step is labelled, so all seven fit on one row. */}
            <span
              className={cn(
                number === current
                  ? 'font-semibold text-ink'
                  : 'sr-only text-ink-muted sm:not-sr-only',
              )}
            >
              {t(step)}
            </span>
          </>
        );
        return (
          <li key={step} aria-current={number === current ? 'step' : undefined}>
            {reachable && number !== current ? (
              <Link
                href={`/prodaja/skripta/${noteId}?korak=${number}`}
                className="flex min-h-11 items-center gap-2 text-sm hover:underline"
              >
                {content}
              </Link>
            ) : (
              <span className="flex min-h-11 items-center gap-2 text-sm">{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Step 1 — course (searchable) and optional professor. */
function CourseStep({
  note,
  onSaved,
}: {
  note: WizardNote | null;
  onSaved: (noteId: string) => void;
}) {
  const t = useTranslations('seller.wizard.course');
  const message = useMessage();
  const [courseId, setCourseId] = useState<string | null>(note?.courseId ?? null);
  const [options, setOptions] = useState<ComboboxOption[]>(
    note?.courseId && note.courseLabel ? [{ value: note.courseId, label: note.courseLabel }] : [],
  );
  const [loading, setLoading] = useState(false);
  const [professors, setProfessors] = useState<
    { id: string; name: string; title: string | null }[]
  >([]);
  const [professorId, setProfessorId] = useState<string>(note?.professorId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    void listCourseProfessorsAction({ courseId }).then((result) => {
      if (active) setProfessors(result.ok ? result.value : []);
    });
    return () => {
      active = false;
    };
  }, [courseId]);

  function onQuery(query: string) {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      setLoading(true);
      const response = await fetch(
        `/api/search?types=course&limit=15&q=${encodeURIComponent(query)}`,
      );
      setLoading(false);
      if (!response.ok) return;
      const data = (await response.json()) as {
        groups: { results: { id: string; title: string; subtitle: string | null }[] }[];
      };
      const results = data.groups[0]?.results ?? [];
      setOptions(
        results.map((r) => ({
          value: r.id,
          label: r.title,
          ...(r.subtitle ? { description: r.subtitle } : {}),
        })),
      );
    }, 200);
  }

  function save() {
    setError(null);
    if (!courseId) {
      setError(message('validation.courseRequired'));
      return;
    }
    startTransition(async () => {
      const result = await saveNoteCourseAction({
        ...(note ? { noteId: note.id } : {}),
        courseId,
        professorId: professorId || null,
      });
      if (result.ok) onSaved(result.value.noteId);
      else setError(message(firstError(result.error)));
    });
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <FormAlert message={error} />
      <Field label={t('course')} description={t('courseHint')}>
        <Combobox
          options={options}
          value={courseId}
          onChange={(value) => setCourseId(value)}
          onQueryChange={onQuery}
          loading={loading}
          placeholder={t('coursePlaceholder')}
        />
      </Field>
      {professors.length > 0 ? (
        <Field label={t('professor')} description={t('professorHint')}>
          <Select value={professorId} onChange={(event) => setProfessorId(event.target.value)}>
            <option value="">{t('noProfessor')}</option>
            {professors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title ? `${p.title} ${p.name}` : p.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Button onClick={save} loading={pending} className="self-start">
        {t('submit')}
      </Button>
    </div>
  );
}

/** Step 2 — direct browser upload (presigned PUT) with progress and cancel. */
function UploadStep({
  noteId,
  maxBytes,
  onUploaded,
  isNewVersion,
}: {
  noteId: string;
  maxBytes: number;
  onUploaded: () => void;
  isNewVersion: boolean;
}) {
  const t = useTranslations('seller.wizard.upload');
  const message = useMessage();
  const [status, setStatus] = useState<UploadStatus>({ state: 'idle' });
  const [changelog, setChangelog] = useState('');
  const [changelogError, setChangelogError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  async function upload(file: File) {
    if (isNewVersion && changelog.trim().length < 3) {
      setChangelogError(message('validation.changelogRequired'));
      return;
    }
    setChangelogError(null);
    setStatus({ state: 'uploading', fileName: file.name, progress: 0 });
    const requested = await requestUploadAction({
      noteId,
      fileName: file.name,
      size: file.size,
      contentType: 'application/pdf',
    });
    if (!requested.ok) {
      setStatus({ state: 'error', message: message(firstError(requested.error, 'file')) });
      return;
    }
    const ok = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open('PUT', requested.value.url);
      for (const [key, value] of Object.entries(requested.value.headers))
        xhr.setRequestHeader(key, value);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          setStatus({
            state: 'uploading',
            fileName: file.name,
            progress: (event.loaded / event.total) * 100,
          });
      };
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.onabort = () => resolve(false);
      xhr.send(file);
    });
    xhrRef.current = null;
    if (!ok) {
      setStatus((current) =>
        current.state === 'idle' ? current : { state: 'error', message: t('failed') },
      );
      return;
    }
    const confirmed = await confirmUploadAction({
      uploadId: requested.value.uploadId,
      ...(isNewVersion ? { changelog } : {}),
    });
    if (!confirmed.ok) {
      setStatus({ state: 'error', message: message(firstError(confirmed.error, 'file')) });
      return;
    }
    setStatus({ state: 'done', fileName: file.name });
    onUploaded();
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <p className="text-ink-muted">{t('intro')}</p>
      {isNewVersion ? (
        <Field
          label={t('changelog')}
          description={t('changelogHint')}
          error={changelogError ?? undefined}
        >
          <Textarea
            rows={3}
            value={changelog}
            onChange={(event) => setChangelog(event.target.value)}
          />
        </Field>
      ) : null}
      <FileDropzone
        maxBytes={maxBytes}
        status={status}
        label={t('choose')}
        onFile={(file) => void upload(file)}
        onCancel={() => {
          xhrRef.current?.abort();
          setStatus({ state: 'idle' });
        }}
      />
    </div>
  );
}

/** Step 3 — live processing status (polling). */
function ProcessingStep({
  noteId,
  onReady,
  onRetry,
}: {
  noteId: string;
  onReady: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('seller.wizard.processing');
  const message = useMessage();
  const [status, setStatus] = useState<ProcessingStatus | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const result = await versionStatusAction({ noteId });
      if (!active) return;
      if (result.ok) setStatus(result.value);
      const state = result.ok ? result.value?.status : 'failed';
      if (state !== 'ready' && state !== 'failed') timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [noteId]);

  if (!status || status.status === 'uploaded' || status.status === 'processing') {
    return (
      <div role="status" aria-live="polite" className="flex max-w-lg flex-col gap-3">
        <p className="font-medium">{t('working')}</p>
        <ul className="flex flex-col gap-1 text-sm text-ink-muted">
          <li>{t('checkFile')}</li>
          <li>{t('renderPreviews')}</li>
          <li>{t('checkDuplicates')}</li>
        </ul>
        <div className="h-2 w-full overflow-hidden rounded-full bg-paper-sunk">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-pen motion-reduce:animate-none" />
        </div>
      </div>
    );
  }
  if (status.status === 'failed') {
    return (
      <div className="flex max-w-lg flex-col gap-3">
        <FormAlert message={message(status.errorKey ?? 'notes.processing.internal')} />
        <Button variant="secondary" onClick={onRetry} className="self-start">
          {t('uploadAgain')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <FormAlert tone="success" message={t('ready', { pages: status.pageCount ?? 0 })} />
      <p className="text-sm text-ink-muted">{t('previewNote')}</p>
      <ul className="flex gap-3 overflow-x-auto pb-2">
        {status.previews.map((preview) => (
          <li
            key={preview.pageNumber}
            className="paper-sheet w-36 shrink-0 overflow-hidden rounded-sm"
          >
            <Image
              src={preview.url}
              alt={t('previewAlt', { page: preview.pageNumber })}
              width={preview.width}
              height={preview.height}
              className="h-auto w-full"
              unoptimized
            />
          </li>
        ))}
      </ul>
      <Button onClick={onReady} className="self-start">
        {t('continue')}
      </Button>
    </div>
  );
}

/** Step 4 — title, description, "How I studied" (markdown with preview and a writing guide). */
function DescriptionStep({ note, onSaved }: { note: WizardNote; onSaved: () => void }) {
  const t = useTranslations('seller.wizard.description');
  const tPeriods = useTranslations('examPeriods');
  const message = useMessage();
  const [values, setValues] = useState({
    title: note.title,
    shortDescription: note.shortDescription,
    howIStudied: note.howIStudied,
    grade: note.grade,
    academicYear: note.academicYear ?? '',
    examPeriod: note.examPeriod ?? '',
    language: note.language,
    tags: note.tags.join(', '),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function loadPreview() {
    const result = await renderMarkdownAction({ markdown: values.howIStudied });
    setPreview(result.ok ? result.value.html : '');
  }

  function save() {
    setFormError(null);
    startTransition(async () => {
      const result = await saveNoteDescriptionAction({
        noteId: note.id,
        title: values.title,
        shortDescription: values.shortDescription,
        howIStudied: values.howIStudied,
        grade: values.grade,
        academicYear: values.academicYear || null,
        examPeriod: (values.examPeriod || null) as (typeof examPeriodKeys)[number] | null,
        language: values.language,
        tags: values.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      if (result.ok) {
        onSaved();
        return;
      }
      const fieldErrors = Object.fromEntries(
        Object.entries(result.error.fieldErrors ?? {}).map(([key, list]) => [
          key,
          message(list[0] ?? ''),
        ]),
      );
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setFormError(message(result.error.messageKey));
      else document.getElementById(`desc-${Object.keys(fieldErrors)[0]}`)?.focus();
    });
  }

  const remaining = Math.max(0, MIN_HOW_I_STUDIED - values.howIStudied.trim().length);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_17rem]">
      <div className="flex flex-col gap-4">
        <FormAlert message={formError} />
        <Field label={t('title')} error={errors.title} id="desc-title" required>
          <Input
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            maxLength={120}
          />
        </Field>
        <Field
          label={t('shortDescription')}
          description={t('shortDescriptionHint')}
          error={errors.shortDescription}
          id="desc-shortDescription"
          required
        >
          <Textarea
            rows={3}
            value={values.shortDescription}
            onChange={(e) => set('shortDescription', e.target.value)}
            maxLength={300}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <Tabs
            defaultValue="write"
            onValueChange={(value) => value === 'preview' && void loadPreview()}
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <label htmlFor="desc-howIStudied" className="text-sm font-medium">
                {t('howIStudied')}{' '}
                <span aria-hidden="true" className="text-danger">
                  *
                </span>
              </label>
              <TabsList label={t('editorTabs')} className="border-b-0">
                <TabsTrigger value="write">{t('write')}</TabsTrigger>
                <TabsTrigger value="preview">{t('preview')}</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="write" className="pt-1">
              <Textarea
                id="desc-howIStudied"
                rows={12}
                value={values.howIStudied}
                onChange={(e) => set('howIStudied', e.target.value)}
                aria-describedby="how-hint how-error"
                aria-invalid={Boolean(errors.howIStudied) || undefined}
                placeholder={t('howIStudiedPlaceholder')}
              />
            </TabsContent>
            <TabsContent value="preview" className="pt-1">
              <div className="notebook min-h-60 rounded-md border border-rule bg-paper-raised p-3 pl-10">
                {/* Sanitized on the server by the same pipeline as the published page. */}
                <div className="prose-notes" dangerouslySetInnerHTML={{ __html: preview }} />
              </div>
            </TabsContent>
          </Tabs>
          <p id="how-hint" className="text-sm text-ink-muted">
            {remaining > 0 ? t('charactersLeft', { count: remaining }) : t('markdownHint')}
          </p>
          {errors.howIStudied ? (
            <p id="how-error" role="alert" className="text-sm text-danger">
              {errors.howIStudied}
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('grade')} description={t('gradeHint')}>
            <Select
              value={values.grade ?? ''}
              onChange={(e) => set('grade', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('gradeNone')}</option>
              {[6, 7, 8, 9, 10].map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('academicYear')} error={errors.academicYear} id="desc-academicYear">
            <Input
              value={values.academicYear}
              onChange={(e) => set('academicYear', e.target.value)}
              placeholder="2025/26"
            />
          </Field>
          <Field label={t('examPeriod')}>
            <Select value={values.examPeriod} onChange={(e) => set('examPeriod', e.target.value)}>
              <option value="">{t('examPeriodNone')}</option>
              {examPeriodKeys.map((key) => (
                <option key={key} value={key}>
                  {tPeriods(key)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('language')}>
            <Select
              value={values.language}
              onChange={(e) => set('language', e.target.value as WizardNote['language'])}
            >
              {(['sr_latn', 'sr_cyrl', 'en', 'other'] as const).map((language) => (
                <option key={language} value={language}>
                  {t(`languages.${language}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('tags')} description={t('tagsHint')} error={errors.tags}>
            <Input value={values.tags} onChange={(e) => set('tags', e.target.value)} />
          </Field>
        </div>
        <Button onClick={save} loading={pending} className="self-start">
          {t('submit')}
        </Button>
      </div>
      <aside
        className="notebook self-start rounded-md bg-paper-raised py-2 pr-3 text-sm"
        aria-labelledby="guide-title"
      >
        <h3 id="guide-title" className="font-sans font-semibold">
          {t('guide.title')}
        </h3>
        <ul className="list-none">
          {(['time', 'order', 'exam', 'differently'] as const).map((key) => (
            <li key={key}>{t(`guide.${key}`)}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/** Step 5 — price with a live "you get" calculation and the course median as a suggestion. */
function PriceStep({
  note,
  commissionBasisPoints,
  maxPricePara,
  suggestedPara,
  onSaved,
}: {
  note: WizardNote;
  commissionBasisPoints: number;
  maxPricePara: number;
  suggestedPara: number | null;
  onSaved: () => void;
}) {
  const t = useTranslations('seller.wizard.price');
  const message = useMessage();
  const [priceRsd, setPriceRsd] = useState<string>(String(note.pricePara / PARA_PER_RSD));
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const parsed = Number(priceRsd);
  const valid = priceRsd.trim() !== '' && Number.isInteger(parsed) && parsed >= 0;
  const split =
    valid && parsed * PARA_PER_RSD <= maxPricePara
      ? calculateCommission(parsed * PARA_PER_RSD, commissionBasisPoints)
      : null;

  function save() {
    if (!valid) {
      setError(message('validation.priceWhole'));
      return;
    }
    startTransition(async () => {
      const result = await saveNotePriceAction({ noteId: note.id, priceRsd: parsed });
      if (result.ok) onSaved();
      else setError(message(firstError(result.error, 'priceRsd')));
    });
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <Field
        label={t('label')}
        description={t('hint', { max: formatPrice(maxPricePara) })}
        error={error}
      >
        <div className="relative">
          <Input
            inputMode="numeric"
            value={priceRsd}
            onChange={(e) => setPriceRsd(e.target.value.replace(/[^\d]/g, ''))}
            className="pr-14 text-lg"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted">
            RSD
          </span>
        </div>
      </Field>
      {suggestedPara ? (
        <p className="text-sm text-ink-muted">
          {t('suggested', { price: formatPrice(suggestedPara) })}{' '}
          <Button
            variant="link"
            size="sm"
            onClick={() => setPriceRsd(String(suggestedPara / PARA_PER_RSD))}
          >
            {t('useSuggested')}
          </Button>
        </p>
      ) : null}
      <div className="rounded-md bg-paper-sunk p-4" aria-live="polite">
        {split ? (
          parsed === 0 ? (
            <p>{t('free')}</p>
          ) : (
            <p className="text-lg">
              {t.rich('youGet', {
                amount: formatPrice(split.sellerPara),
                mark: (chunks) => <span className="marker tabular font-semibold">{chunks}</span>,
              })}
              <span className="mt-1 block text-sm text-ink-muted">
                {t('commission', {
                  percent: commissionBasisPoints / 100,
                  amount: formatPrice(split.commissionPara),
                })}
              </span>
            </p>
          )
        ) : (
          <p className="text-ink-muted">{t('enterPrice')}</p>
        )}
      </div>
      <Button onClick={save} loading={pending} className="self-start">
        {t('submit')}
      </Button>
    </div>
  );
}

/** Step 6 — legal declaration (SPEC §4.4.6). */
function DeclarationStep({ note, onSaved }: { note: WizardNote; onSaved: () => void }) {
  const t = useTranslations('seller.wizard.declaration');
  const message = useMessage();
  const [checked, setChecked] = useState(note.declarationAccepted);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <ul className="list-disc space-y-1 pl-5 text-ink-muted">
        {(['own', 'noTextbooks', 'noPersonal', 'noExam'] as const).map((key) => (
          <li key={key}>{t(`points.${key}`)}</li>
        ))}
      </ul>
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => setChecked(value === true)}
        error={error}
        label={t('confirm')}
      />
      <Button
        loading={pending}
        className="self-start"
        onClick={() => {
          if (!checked) {
            setError(message('validation.declarationRequired'));
            return;
          }
          startTransition(async () => {
            const result = await acceptDeclarationAction({ noteId: note.id, declaration: true });
            if (result.ok) onSaved();
            else setError(message(result.error.messageKey));
          });
        }}
      >
        {t('submit')}
      </Button>
    </div>
  );
}

/** Step 7 — summary and publication. */
function ReviewStep({ note, problems }: { note: WizardNote; problems: string[] }) {
  const t = useTranslations('seller.wizard.review');
  const message = useMessage();
  const router = useRouter();
  const [error, setError] = useState<string[]>([]);
  const [result, setResult] = useState<{ status: string; slug: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = error.length > 0 ? error : problems;
  if (result) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <FormAlert
          tone="success"
          message={result.status === 'published' ? t('published') : t('pendingReview')}
        />
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={routes.note(result.slug)}>{t('view')}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={routes.sell}>{t('toDashboard')}</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-ink-muted">{t('course')}</dt>
        <dd>{note.courseLabel}</dd>
        <dt className="text-ink-muted">{t('title')}</dt>
        <dd>{note.title || '—'}</dd>
        <dt className="text-ink-muted">{t('price')}</dt>
        <dd>
          <PriceTag para={note.pricePara} />
        </dd>
      </dl>
      {shown.length > 0 ? (
        <div role="alert" className="rounded-md bg-warning-soft p-4">
          <p className="font-medium">{t('missing')}</p>
          <ul className="mt-2 list-disc pl-5">
            {shown.map((key) => (
              <li key={key}>{message(key)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-ink-muted">{t('ready')}</p>
      )}
      {note.status === 'rejected' ? <Badge tone="danger">{t('wasRejected')}</Badge> : null}
      <Button
        size="lg"
        className="self-start"
        loading={pending}
        disabled={problems.length > 0}
        onClick={() =>
          startTransition(async () => {
            const published = await publishNoteAction({ noteId: note.id });
            if (published.ok) {
              setResult(published.value);
              router.refresh();
            } else setError(published.error.fieldErrors?._form ?? [published.error.messageKey]);
          })
        }
      >
        {t('publish')}
      </Button>
    </div>
  );
}

export function NoteWizard({
  note,
  step,
  maxPdfBytes,
  commissionBasisPoints,
  maxPricePara,
  suggestedPara,
  problems,
}: {
  note: WizardNote | null;
  step: number;
  maxPdfBytes: number;
  commissionBasisPoints: number;
  maxPricePara: number;
  suggestedPara: number | null;
  problems: string[];
}) {
  const t = useTranslations('seller.wizard');
  const router = useRouter();
  const current = note ? Math.min(Math.max(step, 1), STEPS.length) : 1;
  const go = useCallback(
    (noteId: string, next: number) => router.push(`/prodaja/skripta/${noteId}?korak=${next}`),
    [router],
  );
  const stepKey: StepKey = STEPS[current - 1] ?? 'course';
  const reached = useMemo(() => Math.max(note?.wizardStep ?? 1, current), [note, current]);

  return (
    <div className="flex flex-col gap-6">
      <Stepper current={current} reached={reached} noteId={note?.id ?? null} />
      <section aria-labelledby="wizard-step-title" className="flex flex-col gap-4">
        <h2 id="wizard-step-title" className="text-display-sm font-semibold">
          {t(`titles.${stepKey}`)}
        </h2>
        {stepKey === 'course' ? <CourseStep note={note} onSaved={(id) => go(id, 2)} /> : null}
        {note && stepKey === 'upload' ? (
          <UploadStep
            noteId={note.id}
            maxBytes={maxPdfBytes}
            isNewVersion={false}
            onUploaded={() => go(note.id, 3)}
          />
        ) : null}
        {note && stepKey === 'processing' ? (
          <ProcessingStep
            noteId={note.id}
            onReady={() => go(note.id, 4)}
            onRetry={() => go(note.id, 2)}
          />
        ) : null}
        {note && stepKey === 'description' ? (
          <DescriptionStep note={note} onSaved={() => go(note.id, 5)} />
        ) : null}
        {note && stepKey === 'price' ? (
          <PriceStep
            note={note}
            commissionBasisPoints={commissionBasisPoints}
            maxPricePara={maxPricePara}
            suggestedPara={suggestedPara}
            onSaved={() => go(note.id, 6)}
          />
        ) : null}
        {note && stepKey === 'declaration' ? (
          <DeclarationStep note={note} onSaved={() => go(note.id, 7)} />
        ) : null}
        {note && stepKey === 'review' ? <ReviewStep note={note} problems={problems} /> : null}
      </section>
    </div>
  );
}

export { UploadStep, ProcessingStep };
