import type { GeoBounds, Taxon } from './types';

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

/** About 25 km: keeps coastlines, GPS error and a box's rectangular corners from raising the notice. */
const MARGIN_DEG = 0.25;

export function insideBounds(p: { lat: number; lng: number }, b: GeoBounds, margin = MARGIN_DEG): boolean {
  if (p.lat < b.minY - margin || p.lat > b.maxY + margin) return false;
  if (b.minX <= b.maxX) return p.lng >= b.minX - margin && p.lng <= b.maxX + margin;
  return p.lng >= b.minX - margin || p.lng <= b.maxX + margin; // the box crosses the antimeridian
}

/** True only when every region has a box and the point is inside none of them. Anything unknown means false. */
export function outsideRegions(p: { lat: number; lng: number }, boxes: (GeoBounds | null | undefined)[]): boolean {
  return boxes.length > 0 && boxes.every((b) => !!b) && boxes.every((b) => !insideBounds(p, b!));
}

/** Regions that still need a download: no list yet, or a list saved before bounding boxes existed. */
export function regionsToFetch(regions: string[], records: { key: string; bounds?: GeoBounds | null }[]): string[] {
  const byKey = new Map(records.map((r) => [r.key, r]));
  return regions.filter((r) => !byKey.has(r) || byKey.get(r)!.bounds === undefined);
}

/** Add a region code to the typed list ("NZ, NZ-AUK"), upper-cased and without repeats. */
export function addRegionCode(text: string, code: string): string {
  const codes = text.split(/[ ,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
  const add = code.trim().toUpperCase();
  return (add && !codes.includes(add) ? [...codes, add] : codes).join(',');
}
