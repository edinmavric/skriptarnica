/**
 * Forum ranking (SPEC §4.7): Reddit's hot and controversial for posts, Wilson score lower
 * bound ("Best") for comments.
 */

/** Reddit epoch (2005-12-08). */
const EPOCH_SECONDS = 1134028003;

/** hot = sign(score)·log10(max(|score|, 1)) + (t − epoch)/45000; 10× votes ≈ 12.5 h newer. */
export function hotRank(score: number, createdAt: Date): number {
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  const seconds = createdAt.getTime() / 1000 - EPOCH_SECONDS;
  return Math.round((sign * order + seconds / 45000) * 1e7) / 1e7;
}

/** Many votes, evenly split. 0 when either side has no votes. */
export function controversy(upvotes: number, downvotes: number): number {
  if (upvotes <= 0 || downvotes <= 0) return 0;
  const magnitude = upvotes + downvotes;
  const balance = downvotes > upvotes ? upvotes / downvotes : downvotes / upvotes;
  return magnitude ** balance;
}

/** Lower bound of the Wilson score interval (z = 1.2816, 80% — as Reddit's "best"). */
export function wilsonLowerBound(upvotes: number, downvotes: number, z = 1.281551565545): number {
  const n = upvotes + downvotes;
  if (n === 0) return 0;
  const phat = upvotes / n;
  return (
    (phat + (z * z) / (2 * n) - z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n)) /
    (1 + (z * z) / n)
  );
}

export type TopWindow = 'dan' | 'nedelja' | 'mesec' | 'godina' | 'sve';
export const TOP_WINDOWS: Record<TopWindow, number | null> = {
  dan: 1,
  nedelja: 7,
  mesec: 30,
  godina: 365,
  sve: null,
};
