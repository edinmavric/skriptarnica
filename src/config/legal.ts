/**
 * Current versions of legal documents (SPEC §7.4). Bumping a version forces users to
 * re-accept on their next visit. ⚖️ Texts must be reviewed by a lawyer before launch.
 */
export const legalVersions = {
  terms: '2026-10-25',
  privacy: '2026-10-25',
  sellerTerms: '2026-10-25',
  cookies: '2026-10-25',
} as const;

export const MIN_ACCOUNT_AGE = 15;
export const MIN_SELLER_AGE = 18;
