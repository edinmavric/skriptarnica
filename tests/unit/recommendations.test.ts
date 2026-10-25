import { describe, expect, it } from 'vitest';

import {
  bayesian,
  freshness,
  rankRecommendations,
  scoreCandidate,
  type Candidate,
} from '@/lib/recommendations';

const now = new Date('2026-10-25T12:00:00Z');
const base: Candidate = {
  noteId: 'n',
  sellerId: 's',
  reason: 'enrolled',
  ratingSum: 0,
  reviewCount: 0,
  sales30d: 0,
  updatedAt: now,
  sameProfessor: false,
  owned: false,
};
const make = (overrides: Partial<Candidate>): Candidate => ({ ...base, ...overrides });

describe('recommendation scoring (SPEC §4.5)', () => {
  it('a single 5★ review does not beat 40 reviews averaging 4.7', () => {
    expect(bayesian(5, 1)).toBeLessThan(bayesian(188, 40));
    const one = scoreCandidate(make({ ratingSum: 5, reviewCount: 1 }), now);
    const many = scoreCandidate(make({ ratingSum: 188, reviewCount: 40 }), now);
    expect(many).toBeGreaterThan(one);
  });

  it('ranks enrolled > current year > next year when everything else is equal', () => {
    const ranked = rankRecommendations(
      [
        make({ noteId: 'next', reason: 'nextYear', sellerId: 'a' }),
        make({ noteId: 'enrolled', reason: 'enrolled', sellerId: 'b' }),
        make({ noteId: 'current', reason: 'currentYear', sellerId: 'c' }),
      ],
      now,
      10,
    );
    expect(ranked.map((r) => r.noteId)).toEqual(['enrolled', 'current', 'next']);
  });

  it('decays freshness with a 120-day half-life', () => {
    expect(freshness(now, now)).toBe(1);
    expect(freshness(new Date(now.getTime() - 120 * 86_400_000), now)).toBeCloseTo(0.5, 5);
    expect(freshness(new Date(now.getTime() + 86_400_000), now)).toBe(1);
  });

  it('rewards recent sales logarithmically and the same professor', () => {
    const quiet = scoreCandidate(make({}), now);
    const busy = scoreCandidate(make({ sales30d: 100 }), now);
    const busier = scoreCandidate(make({ sales30d: 1000 }), now);
    expect(busy).toBeGreaterThan(quiet);
    expect(busier - busy).toBeLessThan(busy - quiet);
    expect(scoreCandidate(make({ sameProfessor: true }), now)).toBeGreaterThan(quiet);
  });

  it('excludes notes the user already owns', () => {
    const ranked = rankRecommendations(
      [make({ noteId: 'owned', owned: true }), make({ noteId: 'other', sellerId: 'x' })],
      now,
      10,
    );
    expect(ranked.map((r) => r.noteId)).toEqual(['other']);
  });

  it('allows at most 2 notes from one seller in the top 10', () => {
    const prolific = Array.from({ length: 6 }, (_, i) =>
      make({ noteId: `p${i}`, sellerId: 'prolific', reviewCount: 50, ratingSum: 250 }),
    );
    const others = Array.from({ length: 8 }, (_, i) =>
      make({ noteId: `o${i}`, sellerId: `seller${i}`, reason: 'nextYear' }),
    );
    const ranked = rankRecommendations([...prolific, ...others], now, 12);
    const topTen = ranked.slice(0, 10);
    expect(topTen.filter((r) => r.sellerId === 'prolific')).toHaveLength(2);
    expect(ranked.slice(10).every((r) => r.sellerId === 'prolific')).toBe(true);
    expect(ranked).toHaveLength(12);
  });
});
