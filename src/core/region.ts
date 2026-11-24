import type { Taxon } from './types';

/** Categories that appear on eBird species lists. Slashes, spuhs and hybrids never do, so they are never judged. */
const JUDGED = new Set(['species', 'issf', 'form']);

/**
 * Every species on the trip's regional lists, or undefined while any region has no list yet:
 * with a list missing, a bird on that list would be wrongly called unusual.
 */
export function regionSpecies(regions: string[], lists: Map<string, string[]>): Set<string> | undefined {
  if (regions.length === 0) return undefined;
  const all = new Set<string>();
  for (const r of regions) {
    const list = lists.get(r);
    if (!list) return undefined;
    for (const code of list) all.add(code);
  }
  return all;
}

/** True when the bird is on none of the lists. A subspecies or form counts as its species. */
export function isUnusual(taxon: Taxon | undefined, species: Set<string> | undefined): boolean {
  if (!species || !taxon || !JUDGED.has(taxon.category)) return false;
  return !species.has(taxon.code) && !(taxon.reportAs && species.has(taxon.reportAs));
}

/** The trip's region codes that have no downloaded list yet. */
export function missingRegions(regions: string[], downloaded: Iterable<string>): string[] {
  const have = new Set(downloaded);
  return regions.filter((r) => !have.has(r));
}
