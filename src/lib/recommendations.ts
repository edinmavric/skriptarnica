import {
  courseRelevance,
  FRESHNESS_HALF_LIFE_DAYS,
  MAX_PER_SELLER_IN_TOP,
  recommendationWeights,
  TOP_WINDOW,
} from '@/config/recommendations';

/** Bayesian prior: 5 reviews at 4.0 (same as the course listing). */
const PRIOR_WEIGHT = 5;
const PRIOR_MEAN = 4;

export type CandidateReason = keyof typeof courseRelevance;

export interface Candidate {
  noteId: string;
  sellerId: string;
  reason: CandidateReason;
  ratingSum: number;
  reviewCount: number;
  sales30d: number;
  /** Last content update (current version publication). */
  updatedAt: Date;
  sameProfessor: boolean;
  owned: boolean;
}

export interface Scored extends Candidate {
  score: number;
}

export function bayesian(ratingSum: number, reviewCount: number): number {
  return (ratingSum + PRIOR_WEIGHT * PRIOR_MEAN) / (reviewCount + PRIOR_WEIGHT);
}

export function freshness(updatedAt: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - updatedAt.getTime()) / 86_400_000);
  return Math.exp((-Math.LN2 * ageDays) / FRESHNESS_HALF_LIFE_DAYS);
}

/** score = w1·relevance + w2·bayes/5 + w3·ln(1+sales30d) + w4·freshness + w5·sameProfessor */
export function scoreCandidate(
  candidate: Candidate,
  now: Date,
  weights = recommendationWeights,
): number {
  return (
    weights.courseRelevance * courseRelevance[candidate.reason] +
    weights.bayesianRating * (bayesian(candidate.ratingSum, candidate.reviewCount) / 5) +
    weights.recentSales * Math.log1p(candidate.sales30d) +
    weights.freshness * freshness(candidate.updatedAt, now) +
    weights.sameProfessor * (candidate.sameProfessor ? 1 : 0)
  );
}

/**
 * Scores, excludes owned notes, sorts, and enforces diversity: no more than
 * MAX_PER_SELLER_IN_TOP notes from one seller inside the top TOP_WINDOW (overflow moves down).
 */
export function rankRecommendations(candidates: Candidate[], now: Date, limit: number): Scored[] {
  const scored = candidates
    .filter((candidate) => !candidate.owned)
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, now) }))
    .sort((a, b) => b.score - a.score || a.noteId.localeCompare(b.noteId));
  const top: Scored[] = [];
  const deferred: Scored[] = [];
  const perSeller = new Map<string, number>();
  for (const item of scored) {
    const count = perSeller.get(item.sellerId) ?? 0;
    if (top.length < TOP_WINDOW && count >= MAX_PER_SELLER_IN_TOP) {
      deferred.push(item);
      continue;
    }
    if (top.length < TOP_WINDOW) perSeller.set(item.sellerId, count + 1);
    top.push(item);
  }
  return [...top, ...deferred].slice(0, limit);
}
