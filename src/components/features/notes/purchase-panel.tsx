import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { PriceTag } from '@/components/ui/price-tag';
import { routes } from '@/config/routes';

/** Price and the primary action for a note page. */
export async function PurchasePanel({
  noteId,
  pricePara,
  owned,
  isOwner,
  available,
}: {
  noteId: string;
  slug: string;
  pricePara: number;
  owned: boolean;
  isOwner: boolean;
  available: boolean;
}) {
  const t = await getTranslations('notes.page');
  if (isOwner) {
    return (
      <Button asChild variant="secondary" size="lg" className="w-full">
        <Link href={`/prodaja/skripta/${noteId}?korak=4`}>{t('editOwn')}</Link>
      </Button>
    );
  }
  if (owned) {
    return (
      <Button asChild size="lg" className="w-full">
        <Link href={routes.library}>{t('inLibrary')}</Link>
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <PriceTag para={pricePara} size="lg" />
      {available ? (
        <Button asChild size="lg" className="w-full">
          <Link href={`/kupovina/${noteId}`}>{pricePara === 0 ? t('getFree') : t('buy')}</Link>
        </Button>
      ) : (
        <p className="text-sm text-ink-muted">{t('notAvailable')}</p>
      )}
    </div>
  );
}
