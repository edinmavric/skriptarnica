'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Field } from '@/components/ui/field';
import { LockIcon, PinIcon, SettingsIcon, TrashIcon } from '@/components/ui/icons';
import { Input, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { deletePostAction, editPostAction, moderatePostAction } from '@/server/actions/forum';

/** Moderator menu for a post: remove (with reason) / restore, lock, pin (max 2). */
export function PostModeration({
  postId,
  pinned,
  locked,
  removed,
}: {
  postId: string;
  pinned: boolean;
  locked: boolean;
  removed: boolean;
}) {
  const t = useTranslations('forum.moderation');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const act = (
    action: 'remove' | 'restore' | 'lock' | 'unlock' | 'pin' | 'unpin',
    withReason: string | null = null,
  ) =>
    startTransition(async () => {
      const result = await moderatePostAction({ postId, action, reason: withReason });
      if (result.ok) {
        toast({ title: t(`done.${action}`), tone: 'success' });
        setRemoveOpen(false);
        router.refresh();
      } else
        toast({
          title: tAll(
            Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.messageKey,
          ),
          tone: 'error',
        });
    });
  return (
    <>
      <DropdownRoot>
        <DropdownTrigger asChild>
          <Button variant="secondary" size="sm" loading={pending}>
            <SettingsIcon /> {t('menu')}
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => act(pinned ? 'unpin' : 'pin')}>
            <PinIcon /> {pinned ? t('unpin') : t('pin')}
          </DropdownItem>
          <DropdownItem onSelect={() => act(locked ? 'unlock' : 'lock')}>
            <LockIcon /> {locked ? t('unlock') : t('lock')}
          </DropdownItem>
          {removed ? (
            <DropdownItem onSelect={() => act('restore')}>{t('restore')}</DropdownItem>
          ) : (
            <DropdownItem danger onSelect={() => setRemoveOpen(true)}>
              <TrashIcon /> {t('remove')}
            </DropdownItem>
          )}
        </DropdownContent>
      </DropdownRoot>
      <Dialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t('removeTitle')}
        description={t('removeDescription')}
        footer={
          <Button variant="danger" loading={pending} onClick={() => act('remove', reason || null)}>
            {t('confirmRemove')}
          </Button>
        }
      >
        <Field label={t('reason')}>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </Dialog>
    </>
  );
}

/** Author tools: edit (text posts) and delete. */
export function PostAuthorTools({
  postId,
  title,
  body,
  editable,
}: {
  postId: string;
  title: string;
  body: string;
  editable: boolean;
}) {
  const t = useTranslations('forum.post');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ title, body });
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-1">
      {editable ? (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          trigger={
            <Button variant="ghost" size="sm">
              {t('edit')}
            </Button>
          }
          title={t('editTitle')}
          footer={
            <Button
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await editPostAction({ postId, ...values });
                  if (result.ok) {
                    setOpen(false);
                    router.refresh();
                  } else
                    toast({
                      title: tAll(
                        Object.values(result.error.fieldErrors ?? {})[0]?.[0] ??
                          result.error.messageKey,
                      ),
                      tone: 'error',
                    });
                })
              }
            >
              {t('saveEdit')}
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label={t('titleLabel')}>
              <Input
                value={values.title}
                onChange={(event) => setValues((v) => ({ ...v, title: event.target.value }))}
              />
            </Field>
            <Field label={t('bodyLabel')}>
              <Textarea
                rows={8}
                value={values.body}
                onChange={(event) => setValues((v) => ({ ...v, body: event.target.value }))}
              />
            </Field>
          </div>
        </Dialog>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deletePostAction({ postId });
            if (result.ok) router.refresh();
          })
        }
      >
        {t('delete')}
      </Button>
    </div>
  );
}
