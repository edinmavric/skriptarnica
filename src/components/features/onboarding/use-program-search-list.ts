'use client';

import { useEffect, useState } from 'react';

import { indexPrograms, type IndexedProgram, type ProgramEntry } from '@/lib/search/programs';

/**
 * Downloads the program list once (CDN-cached, see /api/catalog/programs) so the search runs in
 * the browser on every keystroke without a request.
 */
export function useProgramSearchList(): { programs: IndexedProgram[] | null; failed: boolean } {
  const [programs, setPrograms] = useState<IndexedProgram[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/catalog/programs')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ProgramEntry[]>;
      })
      .then((list) => {
        if (!cancelled) setPrograms(indexPrograms(list));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { programs, failed };
}
