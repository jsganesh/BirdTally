// eBird Record Format writer.
// Source: support.ebird.org article 48000907878 ("Upload spreadsheet data to eBird") and its
// Appendix A field list. Rules applied here:
//  - 19 columns, NO header row, .csv only, each file ≤ 1 MB.
//  - No double quotes and no line breaks anywhere; commas would break the columns, so
//    they are replaced too (the format does not allow quoting).
//  - Date MM/DD/YYYY, start time HH:mm (24 h), duration in minutes, distance in miles.
//  - Count: number or X. "All observations reported": Y or N.
//  - Protocol names as in the current article: Stationary, Traveling, Historical, Incidental.
//  - Photos cannot be included in an import; they are added to each checklist afterwards.

import { buildLines, outingLocation } from './checklist';
import { ebirdDate, ebirdTime, KM_PER_MILE } from './geotime';
import type { Outing, Sighting, Taxon } from './types';

export const EBIRD_COLUMNS = [
  'Common Name',
  'Genus',
  'Species',
  'Number',
  'Species Comments',
  'Location Name',
  'Latitude',
  'Longitude',
  'Date',
  'Start Time',
  'State/Province',
  'Country Code',
  'Protocol',
  'Number of Observers',
  'Duration',
  'All observations reported?',
  'Effort Distance Miles',
  'Effort area acres',
  'Checklist Comments'
] as const;

export const MAX_FILE_BYTES = 1_000_000;

/** Names eBird's import expects that differ from the taxonomy's common name (import article). */
export const IMPORT_NAME_OVERRIDES: Record<string, string> = {
  'Rock Pigeon': 'Rock Pigeon (Feral Pigeon)'
};

/** Make a value safe for the quote-less eBird CSV and enforce a maximum length. */
export function clean(value: string | undefined, max: number): string {
  if (!value) return '';
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/"/g, "'")
    .replace(/,/g, ';')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

function splitSci(sci: string): [string, string] {
  const parts = sci.trim().split(/\s+/);
  return [parts[0] ?? '', parts.slice(1).join(' ')];
}

export interface CsvRow {
  outingId: string;
  cells: string[];
}

export function defaultLocationName(outing: Outing, lat?: number, lng?: number): string {
  const d = ebirdDate(outing.startedAt, outing.utcOffsetMin);
  if (lat !== undefined && lng !== undefined) return `BirdTally ${d} ${lat.toFixed(4)} ${lng.toFixed(4)}`;
  return `BirdTally ${d}`;
}

export function outingRows(outing: Outing, sightings: Sighting[], taxa: Map<string, Taxon>, defaultObservers = 1): CsvRow[] {
  const lines = buildLines(outing, sightings, taxa);
  const loc = outingLocation(outing, sightings);
  const protocol = outing.protocol ?? 'Incidental';
  const effort = protocol === 'Stationary' || protocol === 'Traveling';
  const allReported = protocol === 'Incidental' ? 'N' : outing.allReported === 'yes' ? 'Y' : 'N';
  const locationName = clean(outing.locationName?.trim() || defaultLocationName(outing, loc?.lat, loc?.lng), 254);
  return lines.map((l) => {
    const en = l.taxon?.en ?? l.speciesCode;
    const [genus, species] = l.taxon ? splitSci(l.taxon.sci) : ['', ''];
    const cells = [
      clean(IMPORT_NAME_OVERRIDES[en] ?? en, 128),
      clean(genus, 64),
      clean(species, 64),
      l.count === 'X' ? 'X' : String(l.count),
      clean(l.comments, 4000),
      locationName,
      loc ? loc.lat.toFixed(6) : '',
      loc ? loc.lng.toFixed(6) : '',
      ebirdDate(outing.startedAt, outing.utcOffsetMin),
      ebirdTime(outing.startedAt, outing.utcOffsetMin),
      clean(outing.stateCode, 3),
      clean(outing.countryCode, 2),
      protocol,
      String(outing.observers ?? defaultObservers),
      effort && outing.durationMin ? String(Math.round(outing.durationMin)) : '',
      allReported,
      protocol === 'Traveling' && outing.distanceKm ? (outing.distanceKm / KM_PER_MILE).toFixed(3) : '',
      '',
      clean(outing.comments, 4000)
    ];
    return { outingId: outing.id, cells };
  });
}

export interface CsvFile {
  name: string;
  text: string;
  bytes: number;
  rows: number;
  outingIds: string[];
}

/** Join rows into files ≤ 1 MB. A checklist is never split across two files. */
export function toCsvFiles(rows: CsvRow[], baseName: string): CsvFile[] {
  const byOuting = new Map<string, string[]>();
  for (const r of rows) {
    const list = byOuting.get(r.outingId) ?? [];
    list.push(r.cells.join(','));
    byOuting.set(r.outingId, list);
  }
  const enc = new TextEncoder();
  const files: CsvFile[] = [];
  let lines: string[] = [];
  let ids: string[] = [];
  let bytes = 0;
  const flush = () => {
    if (!lines.length) return;
    const text = lines.join('\r\n') + '\r\n';
    files.push({ name: '', text, bytes: enc.encode(text).length, rows: lines.length, outingIds: ids });
    lines = [];
    ids = [];
    bytes = 0;
  };
  for (const [id, ls] of byOuting) {
    const chunk = enc.encode(ls.join('\r\n') + '\r\n').length;
    if (chunk > MAX_FILE_BYTES) throw new Error('One checklist is larger than eBird’s 1 MB file limit.');
    if (bytes + chunk > MAX_FILE_BYTES) flush();
    lines.push(...ls);
    ids.push(id);
    bytes += chunk;
  }
  flush();
  files.forEach((f, i) => (f.name = files.length === 1 ? `${baseName}.csv` : `${baseName}-part${i + 1}.csv`));
  return files;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
