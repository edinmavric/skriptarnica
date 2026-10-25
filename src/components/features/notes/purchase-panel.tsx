import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { PriceTag } from '@/components/ui/price-tag';
import { routes } from '@/config/routes';

interface PurchaseProps {
  noteId: string;
  pricePara: number;
  owned: boolean;
  isOwner: boolean;
  available: boolean;
}

async function PrimaryAction({
  noteId,
  pricePara,
  owned,
  isOwner,
  available,
  size,
}: PurchaseProps & { size: 'md' | 'lg' }) {
  const t = await getTranslations('notes.page');
  if (isOwner) {
    return (
      <Button asChild variant="secondary" size={size} className="w-full">
        <Link href={`/prodaja/skripta/${noteId}?korak=4`}>{t('editOwn')}</Link>
      </Button>
    );
  }
  if (owned) {
    return (
      <Button asChild size={size} className="w-full">
        <Link href={routes.library}>{t('inLibrary')}</Link>
      </Button>
    );
  }
  if (!available) return <p className="text-sm text-ink-muted">{t('notAvailable')}</p>;
  return (
    <Button asChild size={size} className="w-full">
      <Link href={`/kupovina/${noteId}`}>{pricePara === 0 ? t('getFree') : t('buy')}</Link>
    </Button>
  );
}

/** Price and the primary action for a note page (desktop sidebar). */
export async function PurchasePanel(props: PurchaseProps) {
  const showPrice = !props.isOwner && !props.owned;
  return (
    <div className="flex flex-col gap-3">
      {showPrice ? <PriceTag para={props.pricePara} size="lg" /> : null}
      <PrimaryAction {...props} size="lg" />
    </div>
  );
}

/**
 * The same price and action, pinned above the bottom navigation on phones and tablets, where
 * the sidebar ends up below the whole description and the reviews.
 */
export async function PurchaseBar(props: PurchaseProps) {
  const t = await getTranslations('notes.page');
  const showPrice = !props.isOwner && !props.owned;
  return (
    <div
      data-buy-bar
      role="region"
      aria-label={t('purchaseBar')}
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-rule bg-paper-raised/95 backdrop-blur-[2px] md:bottom-0 lg:hidden"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 sm:px-6">
        {showPrice ? <PriceTag para={props.pricePara} className="font-display text-xl" /> : null}
        <div className="ml-auto w-full max-w-[14rem]">
          <PrimaryAction {...props} size="md" />
        </div>
      </div>
    </div>
  );
}
