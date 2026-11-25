import { useMemo, useState } from 'react';
import { searchTaxa, splitFolded, type SearchHit } from '../core/taxonomy';
import { useTaxonomy } from './hooks';

/** Enough candidates to count the folded ones as well as fill the visible list. */
const POOL = 40;

/**
 * Species search with hybrids, slashes and domestic types folded away. `showFolded` reveals them for the current
 * query only; typing again folds them back.
 */
export function useSpeciesSearch(q: string, limit: number, opts: { recent?: string[]; regional?: string[] } = {}) {
  const { index } = useTaxonomy();
  const [shownFor, setShownFor] = useState<string>();
  const { main, folded } = useMemo(
    () => (q.trim() ? splitFolded(searchTaxa(index, q, { recent: opts.recent, regional: opts.regional, limit: POOL }), q) : { main: [] as SearchHit[], folded: [] as SearchHit[] }),
    [q, index, opts.recent, opts.regional]
  );
  const open = shownFor === q;
  const hits = open ? [...main.slice(0, limit), ...folded.slice(0, limit)] : main.slice(0, limit);
  return { hits, main, hidden: open ? 0 : folded.length, showFolded: () => setShownFor(q) };
}

export const foldedLabel = (n: number) => `Show ${n} ${n === 1 ? 'hybrid, domestic type or unsure ID' : 'hybrids, domestic types and unsure IDs'}`;
