'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { CommentTree } from '@/components/ui/comment-tree';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FileDropzone, type UploadStatus } from '@/components/ui/file-dropzone';
import { BookmarkIcon, FlagIcon, PencilIcon, PlusIcon, TrashIcon } from '@/components/ui/icons';
import { Input, Textarea } from '@/components/ui/input';
import { NoteCard } from '@/components/ui/note-card';
import { LoadMore } from '@/components/ui/load-more';
import { Pagination } from '@/components/ui/pagination';
import { PostCard } from '@/components/ui/post-card';
import { PriceTag } from '@/components/ui/price-tag';
import { RadioGroup } from '@/components/ui/radio-group';
import { RatingInput, RatingStars } from '@/components/ui/rating-stars';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { NoteCardSkeleton, PostCardSkeleton, Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { VoteControl, type VoteValue } from '@/components/ui/vote-control';
import { ok } from '@/lib/result';

import { demoComments, demoNotes, demoOptions, demoPosts } from './demo-data';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule py-6">
      <h2 className="mb-4 text-display-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export function UiCatalog({
  theme,
  markdown,
  fontSample,
}: {
  theme: 'light' | 'dark';
  markdown: ReactNode;
  fontSample: string;
}) {
  const t = useTranslations('devUi');
  const { toast } = useToast();
  const [faculty, setFaculty] = useState<string | null>('etf');
  const [rating, setRating] = useState<number | null>(4);
  const [upload, setUpload] = useState<UploadStatus>({ state: 'idle' });
  const [switchOn, setSwitchOn] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const p = (id: string) => `${theme}-${id}`;

  async function fakeVote(value: VoteValue) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return ok({ score: 42 + value, userVote: value });
  }

  return (
    <div data-theme={theme} className="bg-paper px-4 py-6 text-ink sm:px-6">
      <p className="mb-2 text-sm text-ink-muted">{t('theme', { theme })}</p>

      <Section title={t('typography')}>
        <h3 className="text-display-lg font-bold">
          <span className="marker">{t('headlineMarked')}</span> {t('headlineRest')}
        </h3>
        <p className="mt-3 text-display-sm">{fontSample}</p>
        <p className="mt-2 font-sans text-lg">{fontSample}</p>
        <p className="mt-2 font-mono text-sm">OET1, 13E011OET1, {fontSample}</p>
        <p className="tabular mt-2">1.250 RSD / 800 RSD / 11.111 RSD</p>
      </Section>

      <Section title={t('buttons')}>
        <Row>
          <Button>{t('primary')}</Button>
          <Button variant="secondary">{t('secondary')}</Button>
          <Button variant="ghost">{t('ghost')}</Button>
          <Button variant="danger">{t('danger')}</Button>
          <Button variant="link">{t('link')}</Button>
        </Row>
        <div className="mt-3">
          <Row>
            <Button loading>{t('loading')}</Button>
            <Button disabled>{t('disabled')}</Button>
            <Button variant="secondary" size="sm">
              <PlusIcon /> {t('small')}
            </Button>
            <Button size="lg">{t('large')}</Button>
            <Button variant="secondary" size="icon" aria-label={t('save')}>
              <BookmarkIcon />
            </Button>
          </Row>
        </div>
      </Section>

      <Section title={t('forms')}>
        <div className="grid max-w-xl gap-4">
          <Field label={t('email')} description={t('emailHint')} id={p('email')}>
            <Input type="email" placeholder="ime@student.etf.bg.ac.rs" />
          </Field>
          <Field label={t('password')} error={t('passwordError')} id={p('pw')} required>
            <Input type="password" defaultValue="kratka" />
          </Field>
          <Field label={t('disabledInput')} id={p('dis')}>
            <Input disabled value={t('disabledValue')} readOnly />
          </Field>
          <Field label={t('howStudied')} id={p('ta')}>
            <Textarea placeholder={t('howStudiedPlaceholder')} />
          </Field>
          <Field label={t('year')} id={p('sel')}>
            <Select defaultValue="1">
              {[1, 2, 3, 4].map((year) => (
                <option key={year} value={year}>
                  {t('yearOption', { year })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('faculty')} description={t('facultyHint')} id={p('cb')}>
            <Combobox
              options={demoOptions}
              value={faculty}
              onChange={(value) => setFaculty(value)}
              placeholder={t('facultyPlaceholder')}
              footer={
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  {t('missingProgram')}
                </Button>
              }
            />
          </Field>
          <Checkbox id={p('cb1')} label={t('acceptTerms')} />
          <Checkbox
            id={p('cb2')}
            label={t('checked')}
            defaultChecked
            description={t('checkboxHint')}
          />
          <Checkbox id={p('cb3')} label={t('required')} error={t('requiredError')} />
          <Checkbox id={p('cb4')} label={t('disabled')} disabled />
          <RadioGroup
            legend={t('sort')}
            defaultValue="top"
            options={[
              { value: 'recommended', label: t('sortRecommended') },
              { value: 'top', label: t('sortTop'), description: t('sortTopHint') },
              { value: 'new', label: t('sortNew') },
              { value: 'off', label: t('disabled'), disabled: true },
            ]}
          />
          <Switch
            label={t('emailNotifications')}
            description={t('switchHint')}
            checked={switchOn}
            onCheckedChange={setSwitchOn}
          />
          <Switch label={t('disabled')} disabled />
          <RatingInput
            name={p('rating')}
            legend={t('yourRating')}
            value={rating}
            onChange={setRating}
          />
        </div>
      </Section>

      <Section title={t('overlays')}>
        <Row>
          <Dialog
            trigger={<Button variant="secondary">{t('openDialog')}</Button>}
            title={t('dialogTitle')}
            description={t('dialogDescription')}
            footer={
              <>
                <Button variant="ghost">{t('cancel')}</Button>
                <Button variant="danger">{t('confirm')}</Button>
              </>
            }
          >
            <p>{t('dialogBody')}</p>
          </Dialog>
          <Sheet
            trigger={<Button variant="secondary">{t('openSheet')}</Button>}
            title={t('filters')}
          >
            <RadioGroup
              legend={t('sort')}
              hideLegend
              defaultValue="recommended"
              options={[
                { value: 'recommended', label: t('sortRecommended') },
                { value: 'new', label: t('sortNew') },
              ]}
            />
          </Sheet>
          <DropdownRoot>
            <DropdownTrigger asChild>
              <Button variant="secondary">{t('openMenu')}</Button>
            </DropdownTrigger>
            <DropdownContent align="start">
              <DropdownItem>
                <PencilIcon /> {t('edit')}
              </DropdownItem>
              <DropdownItem>
                <FlagIcon /> {t('report')}
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem danger>
                <TrashIcon /> {t('delete')}
              </DropdownItem>
            </DropdownContent>
          </DropdownRoot>
          <Tooltip content={t('tooltip')}>
            <Button variant="ghost">{t('hoverMe')}</Button>
          </Tooltip>
          <Button
            variant="secondary"
            onClick={() => toast({ title: t('toastSaved'), tone: 'success' })}
          >
            {t('toastSuccess')}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: t('toastErrorTitle'),
                description: t('toastErrorBody'),
                tone: 'error',
              })
            }
          >
            {t('toastError')}
          </Button>
        </Row>
      </Section>

      <Section title={t('tabs')}>
        <Tabs defaultValue="notes">
          <TabsList label={t('tabs')}>
            <TabsTrigger value="notes">{t('tabNotes')}</TabsTrigger>
            <TabsTrigger value="posts">{t('tabPosts')}</TabsTrigger>
            <TabsTrigger value="reviews">{t('tabReviews')}</TabsTrigger>
          </TabsList>
          <TabsContent value="notes">{t('tabNotesBody')}</TabsContent>
          <TabsContent value="posts">{t('tabPostsBody')}</TabsContent>
          <TabsContent value="reviews">{t('tabReviewsBody')}</TabsContent>
        </Tabs>
      </Section>

      <Section title={t('badgesAvatars')}>
        <Row>
          <Badge>{t('neutral')}</Badge>
          <Badge tone="marker">{t('verifiedStudent')}</Badge>
          <Badge tone="pen">{t('seller')}</Badge>
          <Badge tone="success">{t('published')}</Badge>
          <Badge tone="warning">{t('pendingReview')}</Badge>
          <Badge tone="danger">{t('rejected')}</Badge>
          <Badge tone="outline">{t('pages')}</Badge>
        </Row>
        <div className="mt-4">
          <Row>
            <Avatar name="Milica Jovanović" size="sm" />
            <Avatar name="Đorđe Ćirić" />
            <Avatar name="Stefan" size="lg" />
            <Avatar name="Ana Marković" />
            <Avatar name="Nikola Petrović" />
          </Row>
        </div>
        <div className="mt-4">
          <Row>
            <PriceTag para={125000} />
            <PriceTag para={80000} size="lg" />
            <PriceTag para={0} />
            <RatingStars value={4.7} count={23} />
            <RatingStars value={3.5} count={2} size="md" />
            <RatingStars value={null} />
          </Row>
        </div>
      </Section>

      <Section title={t('noteCards')}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {demoNotes.map((note) => (
            <NoteCard key={note.slug} note={note} />
          ))}
          <NoteCardSkeleton />
        </div>
      </Section>

      <Section title={t('posts')}>
        {demoPosts.map((post) => (
          <PostCard
            key={post.title}
            post={post}
            vote={<VoteControl score={42} userVote={0} onVote={fakeVote} label={post.title} />}
          />
        ))}
        <PostCardSkeleton />
        <div className="mt-4">
          <Row>
            <VoteControl
              orientation="horizontal"
              score={7}
              userVote={1}
              onVote={fakeVote}
              label={t('demoComment')}
            />
            <VoteControl
              orientation="horizontal"
              score={-3}
              userVote={-1}
              onVote={fakeVote}
              label={t('demoComment')}
            />
            <VoteControl
              orientation="horizontal"
              score={0}
              userVote={0}
              onVote={fakeVote}
              label={t('demoComment')}
              disabled
            />
          </Row>
        </div>
      </Section>

      <Section title={t('comments')}>
        <CommentTree comments={demoComments} continueHref={() => '#'} />
      </Section>

      <Section title={t('markdown')}>{markdown}</Section>

      <Section title={t('upload')}>
        <div className="grid max-w-xl gap-4">
          <FileDropzone
            maxBytes={50 * 1024 * 1024}
            status={upload}
            label={t('choosePdf')}
            onFile={(file) => {
              setUpload({ state: 'uploading', fileName: file.name, progress: 0 });
              let progress = 0;
              const timer = setInterval(() => {
                progress += 20;
                if (progress >= 100) {
                  clearInterval(timer);
                  setUpload({ state: 'done', fileName: file.name });
                } else {
                  setUpload({ state: 'uploading', fileName: file.name, progress });
                }
              }, 300);
            }}
            onCancel={() => setUpload({ state: 'idle' })}
          />
          <FileDropzone
            maxBytes={1}
            status={{ state: 'uploading', fileName: 'oet-skripta.pdf', progress: 62 }}
            label={t('choosePdf')}
            onFile={() => undefined}
            onCancel={() => undefined}
          />
          <FileDropzone
            maxBytes={1}
            status={{ state: 'error', message: t('uploadError') }}
            label={t('choosePdf')}
            onFile={() => undefined}
          />
        </div>
      </Section>

      <Section title={t('emptyAndLoading')}>
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={<Button>{t('emptyAction')}</Button>}
        />
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <Pagination
          label={t('theme', { theme })}
          page={2}
          pageCount={5}
          hrefFor={(page) => `?page=${page}`}
        />
        <LoadMore
          auto={false}
          hasMore
          loading={loadingMore}
          onLoadMore={() => {
            setLoadingMore(true);
            setTimeout(() => setLoadingMore(false), 800);
          }}
        />
      </Section>
    </div>
  );
}
