import { useTranslations } from 'next-intl';

import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';

/** Price in para → "1.250 RSD"; 0 → "Besplatno". Tabular numerals. */
export function PriceTag({
  para,
  size = 'md',
  className,
}: {
  para: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const t = useTranslations('ui');
  return (
    <span
      className={cn(
        'tabular font-semibold whitespace-nowrap',
        size === 'sm' && 'text-sm',
        size === 'md' && 'text-base',
        size === 'lg' && 'font-display text-2xl',
        para === 0 && 'text-success',
        className,
      )}
    >
      {para === 0 ? t('free') : formatPrice(para)}
    </span>
  );
}
