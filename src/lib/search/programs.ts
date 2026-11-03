import { normalizeForSearch } from './normalize';

/** One undergraduate program with its faculty and university (the onboarding search list). */
export interface ProgramEntry {
  programId: string;
  programName: string;
  level: 'oas' | 'mas' | 'das' | 'oss' | 'ias';
  durationYears: number;
  facultyId: string;
  facultyName: string;
  facultyShortName: string;
  universityId: string;
  universityName: string;
  universityShortName: string;
  city: string;
}

export interface IndexedProgram extends ProgramEntry {
  /** Normalized words of program, faculty, university and city, for prefix matching. */
  words: string[];
}

export function indexPrograms(programs: ProgramEntry[]): IndexedProgram[] {
  return programs.map((program) => ({
    ...program,
    words: normalizeForSearch(
      `${program.programName} ${program.facultyName} ${program.facultyShortName} ${program.universityName} ${program.universityShortName} ${program.city}`,
    ).split(' '),
  }));
}

/**
 * Query terms. Serbian inflects word endings (informatika / informaciono, matematika /
 * matematički), so longer words match on their stem: everything but the last four letters, at
 * least five.
 */
export function programSearchTerms(query: string): string[] {
  return normalizeForSearch(query)
    .split(' ')
    .filter(Boolean)
    .map((term) => (term.length > 8 ? term.slice(0, Math.max(5, term.length - 4)) : term));
}

/**
 * Programs where every query term prefixes some word, so any mix of program, faculty, university
 * and city works ("softversko etf", "medicina nis").
 */
export function matchPrograms<T extends IndexedProgram>(
  programs: T[],
  query: string,
  limit = 20,
): T[] {
  const terms = programSearchTerms(query);
  if (terms.length === 0) return [];
  const found: T[] = [];
  for (const program of programs) {
    if (terms.every((term) => program.words.some((word) => word.startsWith(term)))) {
      found.push(program);
      if (found.length === limit) break;
    }
  }
  return found;
}
