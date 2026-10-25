import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { CheckoutForm } from '@/components/features/purchase/checkout-form';
import { FormAlert } from '@/components/forms/form-alert';
import { PriceTag } from '@/components/ui/price-tag';
import { routes } from '@/config/routes';
import { requireAppUser } from '@/server/auth/session';
import { getPurchasableNote, hasActiveEntitlement } from '@/server/services/orders';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('purchase.review');
  return { title: t('title') };
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ noteId: string }>;
  searchParams: Promise<{ otkazano?: string }>;
}) {
  const user = await requireAppUser();
  const { noteId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(noteId)) notFound();
  const note = await getPurchasableNote(noteId);
  if (!note) notFound();
  if (await hasActiveEntitlement(user.id, note.id)) redirect(routes.library);
  const t = await getTranslations('purchase.review');
  const cancelled = (await searchParams).otkazano === '1';
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      {cancelled ? <FormAlert message={t('cancelled')} /> : null}
      <div className="flex flex-col gap-1 rounded-lg border border-rule bg-paper-raised p-4">
        <Link
          href={routes.note(note.slug)}
          className="font-display text-lg font-semibold hover:underline"
        >
          {note.title}
        </Link>
        <PriceTag para={note.pricePara} size="lg" />
        <p className="text-sm text-ink-muted">{t('included')}</p>
      </div>
      {note.sellerId === user.id ? (
        <FormAlert message={t('ownNote')} />
      ) : !user.emailVerified ? (
        <FormAlert message={t('verifyEmail')} />
      ) : (
        <CheckoutForm noteId={note.id} free={note.pricePara === 0} />
      )}
    </div>
  );
}
