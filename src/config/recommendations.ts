/**
 * Recommendation weights (SPEC §4.5). Tune here; scoring is a pure function in
 * lib/recommendations.ts with unit tests documenting the intended ordering.
 */
export const recommendationWeights = {
  /** w1: how relevant the course is to the user right now. */
  courseRelevance: 3,
  /** w2: Bayesian rating, normalized to 0–1. */
  bayesianRating: 2,
  /** w3: log(1 + sales in the last 30 days). */
  recentSales: 0.6,
  /** w4: exponential decay by last content update. */
  freshness: 0.8,
  /** w5: the note's professor is the user's professor for that course. */
  sameProfessor: 1,
} as const;

/** Course relevance by why the course is a candidate. Passed courses are not candidates. */
export const courseRelevance = {
  enrolled: 1,
  currentYear: 0.7,
  nextYear: 0.4,
} as const;

/** Freshness half-life in days: exp(-ln2 × age / halfLife). */
export const FRESHNESS_HALF_LIFE_DAYS = 120;
export const RECOMMENDATION_LIMIT = 12;
/** Diversity: at most this many notes from one seller in the top 10. */
export const MAX_PER_SELLER_IN_TOP = 2;
export const TOP_WINDOW = 10;
export const RECOMMENDATION_CACHE_SECONDS = 15 * 60;
