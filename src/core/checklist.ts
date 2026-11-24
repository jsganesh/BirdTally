import { KM_PER_MILE, localDateKey, spanKm } from './geotime';
import type { GeoPoint, Outing, Sighting, Taxon } from './types';

export interface ChecklistLine {
  speciesCode: string;
  taxon?: Taxon;
  sightingIds: string[];
  /** Number, or 'X' for present / not counted. */
  count: number | 'X';
  /** How the count was arrived at — shown in review. */
  countBasis: 'single entry' | 'your override' | 'largest of several entries' | 'present (X)';
  comments: string;
}

export type Severity = 'error' | 'warning';
export interface Issue {
  severity: Severity;
  message: string;
  field?: string;
}

/**
 * Build one line per species. Several entries of the same species are NOT added together:
 * they may be the same bird. The default is the largest single count, with a warning,
 * until the user sets a count at review.
 */
export function buildLines(outing: Outing, sightings: Sighting[], taxa: Map<string, Taxon>): ChecklistLine[] {
  const by = new Map<string, Sighting[]>();
  for (const s of sightings) {
    if (s.deleted || s.outingId !== outing.id || !s.speciesCode) continue;
    const list = by.get(s.speciesCode) ?? [];
    list.push(s);
    by.set(s.speciesCode, list);
  }
  const lines: ChecklistLine[] = [];
  for (const [code, list] of by) {
    const override = outing.countOverrides[code];
    const numeric = list.filter((s) => s.countMode !== 'present' && typeof s.count === 'number').map((s) => s.count!);
    let count: number | 'X';
    let countBasis: ChecklistLine['countBasis'];
    if (override !== undefined) {
      count = override;
      countBasis = 'your override';
    } else if (numeric.length === 0) {
      count = 'X';
      countBasis = 'present (X)';
    } else if (list.length === 1) {
      count = numeric[0];
      countBasis = 'single entry';
    } else {
      count = Math.max(...numeric);
      countBasis = 'largest of several entries';
    }
    const notes: string[] = [];
    if (list.every((s) => s.detection === 'heard')) notes.push('Heard only.');
    for (const s of list) if (s.note) notes.push(s.note);
    if (list.some((s) => s.countMode === 'estimate') && typeof count === 'number' && countBasis !== 'your override')
      notes.push('Count estimated.');
    lines.push({ speciesCode: code, taxon: taxa.get(code), sightingIds: list.map((s) => s.id), count, countBasis, comments: notes.join(' ') });
  }
  lines.sort((a, b) => (a.taxon?.order ?? 1e9) - (b.taxon?.order ?? 1e9));
  return lines;
}

export function outingPoints(outing: Outing, sightings: Sighting[]): GeoPoint[] {
  const pts = sightings.filter((s) => s.outingId === outing.id && !s.deleted && s.position).map((s) => s.position!);
  if (outing.startPosition) pts.unshift(outing.startPosition);
  return pts;
}

/** Location written to eBird: the start position, else the first located entry. */
export function outingLocation(outing: Outing, sightings: Sighting[]): GeoPoint | undefined {
  if (outing.startPosition) return outing.startPosition;
  return sightings
    .filter((s) => s.outingId === outing.id && !s.deleted && s.position)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))[0]?.position;
}

/** Species recorded as unusual here where no entry has a note or media to back it up. */
function unusualWithoutEvidence(lines: ChecklistLine[], mine: Sighting[]): string[] {
  return lines
    .filter((l) => {
      const own = mine.filter((s) => s.speciesCode === l.speciesCode);
      return own.some((s) => s.unusualHere) && !own.some((s) => s.note || s.mediaIds.length);
    })
    .map((l) => l.taxon?.en ?? l.speciesCode);
}

/** Validate an outing as an eBird checklist. Errors block export; warnings need a look. */
export function validateChecklist(outing: Outing, sightings: Sighting[], taxa: Map<string, Taxon>): Issue[] {
  const issues: Issue[] = [];
  const mine = sightings.filter((s) => s.outingId === outing.id && !s.deleted);
  const lines = buildLines(outing, sightings, taxa);
  const err = (message: string, field?: string) => issues.push({ severity: 'error', message, field });
  const warn = (message: string, field?: string) => issues.push({ severity: 'warning', message, field });

  if (lines.length === 0) err('No identified species in this birding session yet.');
  for (const l of lines) if (!l.taxon) err(`Species code "${l.speciesCode}" is not in the downloaded taxonomy. Review the identification.`);

  const dates = new Set(mine.map((s) => localDateKey(s.observedAt, s.utcOffsetMin)));
  dates.add(localDateKey(outing.startedAt, outing.utcOffsetMin));
  if (dates.size > 1) err(`Entries fall on ${dates.size} different dates (${[...dates].sort().join(', ')}). eBird checklists cover one calendar date — split this birding session.`);

  const loc = outingLocation(outing, sightings);
  if (!loc && !outing.locationName?.trim()) err('No GPS position and no location name. Add a location name; you will place it on the map during eBird import.', 'locationName');
  else if (!loc) warn('No coordinates. eBird import will ask you to place this location on the map.');
  const pts = outingPoints(outing, sightings);
  const span = spanKm(pts);
  if (span > 2) warn(`Entries are spread over ${span.toFixed(1)} km. If you stopped at separate sites, split this into one checklist per site.`);

  const pending = mine.filter((s) => !s.speciesCode).length;
  if (pending) warn(`${pending} entr${pending === 1 ? 'y is' : 'ies are'} still "identification pending" and will be left out.`);

  for (const l of lines) {
    if (l.countBasis === 'largest of several entries')
      warn(`${l.taxon?.en ?? l.speciesCode}: ${l.sightingIds.length} entries. Count set to the largest single count (${l.count}). If they were different birds, set the total.`, `count:${l.speciesCode}`);
    if (typeof l.count === 'number' && (l.count < 1 || l.count > 999999 || !Number.isInteger(l.count))) err(`${l.taxon?.en ?? l.speciesCode}: count must be a whole number from 1 to 999999, or X.`);
  }
  for (const name of unusualWithoutEvidence(lines, mine))
    warn(`${name} was recorded as unusual here. eBird reviewers usually ask for a description or photo: add a description to the entry's note (it goes to eBird as the species comment).`);
  if (mine.some((s) => s.possibleCaptive)) warn('Some entries are marked as possibly captive or escaped. eBird asks you not to report captive birds.');
  if (mine.some((s) => s.tz !== outing.tz)) warn('Time zone changed during this birding session. Check the date and start time.');

  const p = outing.protocol;
  if (!p) err('Choose a protocol.', 'protocol');
  if (p === 'Stationary' || p === 'Traveling') {
    if (!outing.durationMin || outing.durationMin < 1) err(`${p} needs a duration in minutes.`, 'durationMin');
    else if (outing.durationMin >= 1440) err('Duration must be under 24 hours (1440 minutes).', 'durationMin');
    if (outing.origin !== 'tapped') warn('Start time and duration were not recorded with Birding mode. Use Traveling or Stationary only if you know your real effort; otherwise choose Incidental.');
  }
  if (p === 'Stationary' && span > 0.03) warn(`Entries are up to ${Math.round(span * 1000)} m apart; Stationary means staying within about 30 m. Consider Traveling.`);
  if (p === 'Traveling') {
    if (outing.distanceKm === undefined || outing.distanceKm <= 0) err('Traveling needs the distance you covered.', 'distanceKm');
    else if (outing.distanceKm / KM_PER_MILE > 5) warn('eBird recommends keeping Traveling checklists under 5 miles (8 km).');
    if (outing.distanceKm !== undefined && outing.distanceKm + 0.05 < span) warn(`Distance (${outing.distanceKm} km) is less than the ${span.toFixed(2)} km between your furthest entries.`);
  }
  if (p === 'Stationary' && (outing.durationMin ?? 0) > 180) warn('eBird recommends keeping Stationary checklists under 3 hours.');

  if (p && p !== 'Incidental' && outing.allReported === null)
    err('Answer: did you report every species you identified by sight or sound?', 'allReported');
  if (p === 'Incidental' && outing.allReported === 'yes') warn('Incidental checklists are never complete; this will be exported as "N".');
  if (outing.origin === 'confirmed-proposal' && outing.allReported === 'yes')
    warn('This birding session was put together after the fact. Mark it complete only if you are sure you recorded every species you identified.');

  if ((outing.locationName?.length ?? 0) > 254) err('Location name is longer than 254 characters.');
  if ((outing.comments?.length ?? 0) > 4000) err('Checklist comments are longer than 4000 characters.');
  if (outing.countryCode && !/^[A-Z]{2}$/.test(outing.countryCode)) err('Country code must be 2 letters, e.g. NZ.');
  if (outing.stateCode && !/^[A-Z0-9]{1,3}$/.test(outing.stateCode)) err('State/region code must be 1–3 characters.');

  if (outing.submission === 'exported' && outing.exportedVersion !== undefined && outing.version > outing.exportedVersion)
    warn('You have edited this checklist since you exported it. The file you uploaded to eBird may differ from what you see here.');
  if (outing.submission === 'submitted') warn('Already marked as submitted to eBird. Exporting again could create a duplicate checklist.');

  return issues;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === 'error');
