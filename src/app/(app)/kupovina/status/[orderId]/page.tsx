import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { PaymentStatus } from '@/components/features/purchase/payment-status';
import { requireAppUser } from '@/server/auth/session';
import { getOrderForBuyer } from '@/server/services/orders';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('purchase.status');
  return { title: t('title') };
}

export default async function PaymentStatusPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const user = await requireAppUser();
  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const row = await getOrderForBuyer(user.id, orderId);
  if (!row) notFound();
  const t = await getTranslations('purchase.status');
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <p className="font-medium">{row.noteTitle}</p>
      <PaymentStatus
        orderId={orderId}
        initial={row.order.status}
        noteId={row.noteId}
        noteSlug={row.noteSlug}
      />
    </div>
  );
}
