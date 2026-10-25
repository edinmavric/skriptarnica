import { company } from '@/config/company';
import { siteConfig } from '@/config/site';
import { calculateCommission } from '@/lib/money';
import { formatPrice } from '@/lib/format';

import { getSettings } from './settings';

/** Live numbers for public texts, so copy never disagrees with the settings. */
export async function publicValues(): Promise<Record<string, string>> {
  const settings = await getSettings();
  const example = calculateCommission(80_000, settings.commissionBasisPoints);
  return {
    site: siteConfig.name,
    commission: `${settings.commissionBasisPoints / 100}%`,
    holdDays: String(settings.fundsHoldDays),
    minPayout: formatPrice(settings.minPayoutPara),
    maxPrice: formatPrice(settings.maxNotePricePara),
    problemDays: String(settings.purchaseProblemWindowDays),
    examplePrice: formatPrice(80_000),
    exampleSeller: formatPrice(example.sellerPara),
    exampleCommission: formatPrice(example.commissionPara),
    email: company.email,
  };
}
