'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { routes } from '@/config/routes';
import { renderMarkdownAction } from '@/server/actions/editor';
import { createPostAction } from '@/server/actions/forum';

type PostType = 'text' | 'link' | 'note_share' | 'poll';

/**
 * New post (SPEC §4.7): text (markdown + preview), link (server-side preview), note share,
 * poll; flair, exam period, anonymity. Professor communities show the conduct reminder on the
 * first post.
 */
export function PostComposer({
  communityId,
  communitySlug,
  flairs,
  examPeriods,
  needsRulesAck,
  rules,
  ownNotes,
}: {
  communityId: string;
  communitySlug: string;
  flairs: { id: string; name: string }[];
  examPeriods: { id: string; label: string }[];
  needsRulesAck: boolean;
  rules: string;
  ownNotes: { id: string; title: string }[];
}) {
  const t = useTranslations('forum.composer');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [type, setType] = useState<PostType>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [noteId, setNoteId] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [flairId, setFlairId] = useState('');
  const [examPeriodId, setExamPeriodId] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [preview, setPreview] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(acknowledgeRules = false) {
    setFormError(null);
    if (needsRulesAck && !acknowledgeRules) {
      setRulesOpen(true);
      return;
    }
    startTransition(async () => {
      const result = await createPostAction({
        communityId,
        type,
        title,
        body,
        isAnonymous: anonymous,
        ...(type === 'link' ? { url } : {}),
        ...(type === 'note_share' && noteId ? { noteId } : {}),
        ...(type === 'poll' ? { pollOptions: options.filter((option) => option.trim()) } : {}),
        flairId: flairId || null,
        examPeriodId: examPeriodId || null,
        ...(acknowledgeRules ? { acknowledgeRules: true } : {}),
      });
      if (result.ok) {
        router.push(routes.post(result.value.communitySlug, result.value.id, result.value.slug));
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
      else document.getElementById(`composer-${Object.keys(fieldErrors)[0]}`)?.focus();
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <FormAlert message={formError} />
      <Tabs value={type} onValueChange={(value) => setType(value as PostType)}>
        <TabsList label={t('typeLabel')}>
          {(['text', 'link', 'note_share', 'poll'] as const).map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`types.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Field label={t('titleField')} error={errors.title} id="composer-title" required>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
      </Field>

      {type === 'link' ? (
        <Field
          label={t('url')}
          description={t('urlHint')}
          error={errors.url}
          id="composer-url"
          required
        >
          <Input
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
          />
        </Field>
      ) : null}

      {type === 'note_share' ? (
        <Field
          label={t('note')}
          description={ownNotes.length === 0 ? t('noteHintEmpty') : t('noteHint')}
          error={errors.noteId}
          id="composer-noteId"
          required
        >
          <Select value={noteId} onChange={(event) => setNoteId(event.target.value)}>
            <option value="">{t('notePlaceholder')}</option>
            {ownNotes.map((note) => (
              <option key={note.id} value={note.id}>
                {note.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {type === 'poll' ? (
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={errors.pollOptions ? 'poll-error' : undefined}
        >
          <legend className="mb-1 text-sm font-medium">{t('pollOptions')}</legend>
          {options.map((option, index) => (
            <Input
              key={index}
              id={index === 0 ? 'composer-pollOptions' : undefined}
              aria-label={t('pollOption', { number: index + 1 })}
              value={option}
              maxLength={100}
              onChange={(event) =>
                setOptions((current) =>
                  current.map((value, i) => (i === index ? event.target.value : value)),
                )
              }
            />
          ))}
          {options.length < 6 ? (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setOptions((current) => [...current, ''])}
            >
              {t('addOption')}
            </Button>
          ) : null}
          {errors.pollOptions ? (
            <p id="poll-error" role="alert" className="text-sm text-danger">
              {errors.pollOptions}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Tabs
          defaultValue="write"
          onValueChange={async (value) => {
            if (value !== 'preview') return;
            const result = await renderMarkdownAction({ markdown: body });
            setPreview(result.ok ? result.value.html : '');
          }}
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label htmlFor="composer-body" className="text-sm font-medium">
              {type === 'text' ? t('body') : t('bodyOptional')}
            </label>
            <TabsList label={t('editorTabs')} className="border-b-0">
              <TabsTrigger value="write">{t('write')}</TabsTrigger>
              <TabsTrigger value="preview">{t('preview')}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="write" className="pt-1">
            <Textarea
              id="composer-body"
              rows={8}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              aria-invalid={Boolean(errors.body) || undefined}
              aria-describedby={errors.body ? 'body-error' : 'body-hint'}
            />
          </TabsContent>
          <TabsContent value="preview" className="pt-1">
            {/* Sanitized server-side by the same pipeline as published posts. */}
            <div
              className="prose-notes min-h-40 rounded-md border border-rule bg-paper-raised p-3"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          </TabsContent>
        </Tabs>
        <p id="body-hint" className="text-sm text-ink-muted">
          {t('markdownHint')}
        </p>
        {errors.body ? (
          <p id="body-error" role="alert" className="text-sm text-danger">
            {errors.body}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {flairs.length > 0 ? (
          <Field label={t('flair')}>
            <Select value={flairId} onChange={(event) => setFlairId(event.target.value)}>
              <option value="">{t('noFlair')}</option>
              {flairs.map((flair) => (
                <option key={flair.id} value={flair.id}>
                  {flair.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {examPeriods.length > 0 ? (
          <Field label={t('examPeriod')}>
            <Select value={examPeriodId} onChange={(event) => setExamPeriodId(event.target.value)}>
              <option value="">{t('noExamPeriod')}</option>
              {examPeriods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <Switch
        label={t('anonymous')}
        description={t('anonymousHint')}
        checked={anonymous}
        onCheckedChange={setAnonymous}
      />

      <div className="flex gap-3">
        <Button size="lg" loading={pending} onClick={() => submit(false)}>
          {t('submit')}
        </Button>
        <Button
          size="lg"
          variant="ghost"
          onClick={() => router.push(routes.community(communitySlug))}
        >
          {t('cancel')}
        </Button>
      </div>

      <Dialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        title={t('rulesTitle')}
        description={t('rulesDescription')}
        footer={
          <Button
            disabled={!rulesAccepted}
            onClick={() => {
              setRulesOpen(false);
              submit(true);
            }}
          >
            {t('rulesAccept')}
          </Button>
        }
      >
        <ul className="mb-4 list-disc space-y-1 pl-5">
          {(['allowed', 'noInsults', 'noPrivate', 'noFalse'] as const).map((key) => (
            <li key={key}>{t(`rulesPoints.${key}`)}</li>
          ))}
        </ul>
        {rules ? <p className="mb-4 text-sm whitespace-pre-line text-ink-muted">{rules}</p> : null}
        <Checkbox
          checked={rulesAccepted}
          onCheckedChange={(value) => setRulesAccepted(value === true)}
          label={t('rulesCheckbox')}
        />
      </Dialog>
    </div>
  );
}
