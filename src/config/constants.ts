/**
 * Business defaults from SPEC §14. Admin-editable settings override these at runtime (Phase 9).
 * Money is always an integer amount in para (1 RSD = 100 para).
 */
export const PARA_PER_RSD = 100;

export const defaults = {
  platformCommissionPercent: 20,
  /** Same value in basis points (20% = 2000) for integer arithmetic. */
  platformCommissionBasisPoints: 2000,
  fundsHoldDays: 14,
  minPayoutPara: 1_000 * PARA_PER_RSD,
  maxNotePricePara: 3_000 * PARA_PER_RSD,
  maxPdfSizeBytes: 50 * 1024 * 1024,
  previewPagesMax: 3,
  previewPagesMaxRatio: 0.15,
  purchaseProblemWindowDays: 7,
  preModeratedNotesCount: 3,
  maxCommunitiesPerUser: 3,
  minAccountAgeDaysToCreateCommunity: 7,
  /** No daily download limit (SPEC §4.3, §14). */
  downloadsPerNotePerDay: Number.POSITIVE_INFINITY,
} as const;
