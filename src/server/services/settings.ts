import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defaults } from '@/config/constants';

import { db } from '../db/client';
import { appSettings } from '../db/schema';
import type { DbOrTx } from '../db/types';
import { logger } from '../logger';
import { redis } from '../redis';

/** Platform settings (SPEC §14), editable in admin (Phase 9). Values are validated on read. */
export const settingsSchema = z.object({
  commissionBasisPoints: z.number().int().min(0).max(10_000),
  fundsHoldDays: z.number().int().min(0).max(120),
  minPayoutPara: z.number().int().min(0),
  maxNotePricePara: z.number().int().min(0),
  maxPdfSizeBytes: z.number().int().min(1),
  previewPagesMax: z.number().int().min(1).max(10),
  previewPagesMaxRatio: z.number().min(0.01).max(1),
  purchaseProblemWindowDays: z.number().int().min(0).max(60),
  preModeratedNotesCount: z.number().int().min(0).max(50),
  maxCommunitiesPerUser: z.number().int().min(0).max(100),
  minAccountAgeDaysToCreateCommunity: z.number().int().min(0).max(365),
  featureFlags: z.object({
    taxCalculation: z.boolean(),
    invoicing: z.boolean(),
  }),
});
export type PlatformSettings = z.infer<typeof settingsSchema>;

export const defaultSettings: PlatformSettings = {
  commissionBasisPoints: defaults.platformCommissionBasisPoints,
  fundsHoldDays: defaults.fundsHoldDays,
  minPayoutPara: defaults.minPayoutPara,
  maxNotePricePara: defaults.maxNotePricePara,
  maxPdfSizeBytes: defaults.maxPdfSizeBytes,
  previewPagesMax: defaults.previewPagesMax,
  previewPagesMaxRatio: defaults.previewPagesMaxRatio,
  purchaseProblemWindowDays: defaults.purchaseProblemWindowDays,
  preModeratedNotesCount: defaults.preModeratedNotesCount,
  maxCommunitiesPerUser: defaults.maxCommunitiesPerUser,
  minAccountAgeDaysToCreateCommunity: defaults.minAccountAgeDaysToCreateCommunity,
  // ⚖️ Off until an accountant confirms the rules (SPEC §4.4, §5.3.7).
  featureFlags: { taxCalculation: false, invoicing: false },
};

const CACHE_KEY = 'settings:v1';

export async function getSettings(tx: DbOrTx = db): Promise<PlatformSettings> {
  try {
    const cached = await redis.get<PlatformSettings>(CACHE_KEY);
    if (cached) {
      const parsed = settingsSchema.safeParse(cached);
      if (parsed.success) return parsed.data;
    }
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      'settings cache read failed',
    );
  }
  const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, 'platform'));
  const merged = settingsSchema.safeParse({
    ...defaultSettings,
    ...(row?.value as Partial<PlatformSettings> | undefined),
  });
  const settings = merged.success ? merged.data : defaultSettings;
  try {
    await redis.set(CACHE_KEY, settings, { ex: 300 });
  } catch {
    // cache is optional
  }
  return settings;
}

export async function saveSettings(
  tx: DbOrTx,
  value: PlatformSettings,
  updatedById: string,
): Promise<void> {
  const parsed = settingsSchema.parse(value);
  await tx
    .insert(appSettings)
    .values({ key: 'platform', value: parsed, updatedById })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: parsed, updatedById } });
  await redis.del(CACHE_KEY);
}
