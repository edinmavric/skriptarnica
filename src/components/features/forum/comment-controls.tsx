'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { ReportDialog } from '@/components/features/report-dialog';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { MessageIcon, PencilIcon, QuoteIcon, TrashIcon } from '@/components/ui/icons';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import {
  createCommentAction,
  deleteCommentAction,
  editCommentAction,
  moderateCommentAction,
} from '@/server/actions/forum';

/** New top-level comment or reply. */
export function CommentForm({
  postId,
  parentId,
  initialBody = '',
  onDone,
  autoFocus,
}: {
  postId: string;
  parentId: string | null;
  initialBody?: string;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations('forum.comment');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Field
        label={parentId ? t('replyLabel') : t('newLabel')}
        hideLabel={Boolean(parentId)}
        error={error}
      >
        <Textarea
          rows={parentId ? 3 : 4}
          value={body}
          autoFocus={autoFocus}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Switch
          label={t('anonymous')}
          checked={anonymous}
          onCheckedChange={setAnonymous}
          className="gap-2"
        />
        <div className="flex gap-2">
          {onDone ? (
            <Button variant="ghost" size="sm" onClick={onDone}>
              {t('cancel')}
            </Button>
          ) : null}
          <Button
            size="sm"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await createCommentAction({
                  postId,
                  parentId,
                  body,
                  isAnonymous: anonymous,
                });
                if (result.ok) {
                  setBody('');
                  setError(undefined);
                  onDone?.();
                  router.refresh();
                } else
                  setError(tAll(result.error.fieldErrors?.body?.[0] ?? result.error.messageKey));
              })
            }
          >
            {parentId ? t('sendReply') : t('send')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Per-comment actions: reply, quote, edit, delete (own), report, moderator removal. */
export function CommentActions({
  postId,
  commentId,
  body,
  isOwn,
  canReply,
  isModerator,
  removed,
  signedIn,
}: {
  postId: string;
  commentId: string;
  body: string | null;
  isOwn: boolean;
  canReply: boolean;
  isModerator: boolean;
  removed: boolean;
  signedIn: boolean;
}) {
  const t = useTranslations('forum.comment');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<'none' | 'reply' | 'quote' | 'edit' | 'remove'>('none');
  const [editBody, setEditBody] = useState(body ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const quoted = body
    ? `${body
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')}\n\n`
    : '';
  const run = (fn: () => Promise<{ ok: boolean; error?: { messageKey: string } }>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setMode('none');
        router.refresh();
      } else setError(tAll(result.error?.messageKey ?? 'errors.internal'));
    });

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-0.5">
        {canReply && signedIn ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode(mode === 'reply' ? 'none' : 'reply')}
            >
              <MessageIcon /> {t('reply')}
            </Button>
            {body ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode(mode === 'quote' ? 'none' : 'quote')}
              >
                <QuoteIcon /> {t('quote')}
              </Button>
            ) : null}
          </>
        ) : null}
        {isOwn && body ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode(mode === 'edit' ? 'none' : 'edit')}
            >
              <PencilIcon /> {t('edit')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => run(() => deleteCommentAction({ commentId }))}
            >
              <TrashIcon /> {t('delete')}
            </Button>
          </>
        ) : null}
        {signedIn && !isOwn && body ? (
          <ReportDialog targetType="comment" targetId={commentId} compact />
        ) : null}
        {isModerator ? (
          removed ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                run(() => moderateCommentAction({ commentId, action: 'restore', reason: null }))
              }
            >
              {t('restore')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode(mode === 'remove' ? 'none' : 'remove')}
            >
              {t('remove')}
            </Button>
          )
        ) : null}
      </div>
      <FormAlert message={error} />
      {mode === 'reply' || mode === 'quote' ? (
        <div className="mt-2">
          <CommentForm
            postId={postId}
            parentId={commentId}
            initialBody={mode === 'quote' ? quoted : ''}
            onDone={() => setMode('none')}
            autoFocus
          />
        </div>
      ) : null}
      {mode === 'edit' ? (
        <div className="mt-2 flex flex-col gap-2">
          <Textarea
            aria-label={t('edit')}
            rows={3}
            value={editBody}
            onChange={(event) => setEditBody(event.target.value)}
          />
          <Button
            size="sm"
            className="self-start"
            loading={pending}
            onClick={() => run(() => editCommentAction({ commentId, body: editBody }))}
          >
            {t('saveEdit')}
          </Button>
        </div>
      ) : null}
      {mode === 'remove' ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>{t('removeReason')}</span>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-9"
            />
          </label>
          <Button
            size="sm"
            variant="danger"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await moderateCommentAction({
                  commentId,
                  action: 'remove',
                  reason: reason || null,
                });
                if (result.ok) {
                  toast({ title: t('removedToast'), tone: 'success' });
                  setMode('none');
                  router.refresh();
                } else
                  setError(
                    tAll(
                      Object.values(result.error.fieldErrors ?? {})[0]?.[0] ??
                        result.error.messageKey,
                    ),
                  );
              })
            }
          >
            {t('confirmRemove')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
