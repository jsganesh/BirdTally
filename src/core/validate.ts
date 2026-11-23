// Boundary check for BirdTally files. An imported file is untrusted: a damaged or hand-edited
// record must be refused before it reaches storage, where a missing list or a wrong type
// would break the app or win a merge it should not.
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, type BirdTallyFile } from './merge';

type Check = (v: unknown) => boolean;
type Spec = Record<string, Check>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str: Check = (v) => typeof v === 'string';
const id: Check = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200;
const iso: Check = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const bool: Check = (v) => typeof v === 'boolean';
const optional = (c: Check): Check => (v) => v === undefined || c(v);
const oneOf = (...xs: unknown[]): Check => (v) => xs.includes(v);
const listOf = (c: Check): Check => (v) => Array.isArray(v) && v.every(c);
const shape = (spec: Spec): Check => (v) => isObj(v) && Object.entries(spec).every(([k, c]) => c(v[k]));
const between = (lo: number, hi: number): Check => (v) => num(v) && (v as number) >= lo && (v as number) <= hi;
const base64: Check = (v) => typeof v === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(v);
const mediaMime: Check = (v) => typeof v === 'string' && /^(image|audio)\/[\w.+-]+(;[\w=.+-]+)*$/.test(v);

const geo = shape({ lat: between(-90, 90), lng: between(-180, 180), accuracyM: optional(num), at: iso });

const META: Spec = { id, createdAt: iso, updatedAt: iso, deviceId: str, deleted: optional(bool), history: optional(listOf(iso)) };

const TRIP: Spec = { ...META, name: str, countryCodes: listOf(str), startDate: optional(str), endDate: optional(str) };

const OUTING: Spec = {
  ...META,
  tripId: optional(str),
  origin: oneOf('tapped', 'confirmed-proposal', 'manual'),
  startedAt: iso,
  endedAt: optional(iso),
  tz: str,
  utcOffsetMin: between(-14 * 60, 14 * 60),
  startPosition: optional(geo),
  locationName: optional(str),
  countryCode: optional(str),
  stateCode: optional(str),
  protocol: optional(oneOf('Incidental', 'Stationary', 'Traveling', 'Historical')),
  durationMin: optional(num),
  distanceKm: optional(num),
  observers: optional(num),
  allReported: oneOf('yes', 'no', null),
  comments: optional(str),
  countOverrides: (v) => isObj(v) && Object.values(v).every((x) => num(x) || x === 'X'),
  version: num,
  submission: oneOf('draft', 'ready', 'exported', 'submitted', 'needs_correction'),
  exportedVersion: optional(num),
  ebirdChecklistId: optional(str)
};

const SIGHTING: Spec = {
  ...META,
  tripId: optional(str),
  outingId: (v) => v === undefined || v === null || id(v),
  observedAt: iso,
  tz: str,
  utcOffsetMin: between(-14 * 60, 14 * 60),
  position: optional(geo),
  positionStatus: oneOf('pending', 'ok', 'unavailable', 'denied'),
  speciesCode: optional(str),
  countMode: oneOf('exact', 'estimate', 'present'),
  count: optional(num),
  detection: oneOf('seen', 'heard', 'both'),
  note: optional(str),
  merlinSuggestion: optional(str),
  possibleCaptive: optional(bool),
  mediaIds: listOf(id),
  idHistory: listOf(shape({ at: iso, speciesCode: optional(str), source: oneOf('me', 'merlin-noted'), note: optional(str) }))
};

const MEDIA: Spec = {
  ...META,
  sightingId: id,
  kind: oneOf('audio', 'photo'),
  mime: mediaMime,
  bytes: num,
  capturedAt: iso,
  durationSec: optional(num),
  dataBase64: base64
};

const EXPORT: Spec = { id, createdAt: iso, fileName: str, sha256: str, bytes: num, rows: num, outings: listOf(shape({ outingId: id, version: num })) };

const LABEL = { trips: 'Trip', outings: 'Birding session', sightings: 'Sighting', media: 'Media item', exports: 'Export record' } as const;
const SPECS: Record<keyof typeof LABEL, Spec> = { trips: TRIP, outings: OUTING, sightings: SIGHTING, media: MEDIA, exports: EXPORT };

function checkList(key: keyof typeof LABEL, list: unknown) {
  if (!Array.isArray(list)) throw new Error(`File is damaged: "${key}" is missing.`);
  const seen = new Set<unknown>();
  list.forEach((rec, i) => {
    const where = `${LABEL[key]} ${i + 1}`;
    if (!isObj(rec)) throw new Error(`File is damaged: ${where} is not a record.`);
    for (const [field, check] of Object.entries(SPECS[key]))
      if (!check(rec[field])) throw new Error(`File is damaged: ${where} has a missing or invalid "${field}".`);
    if (seen.has(rec.id)) throw new Error(`File is damaged: ${where} repeats id ${String(rec.id)}.`);
    seen.add(rec.id);
  });
}

/** Accept a parsed file only if every record has the shape the app relies on. */
export function validateFile(data: unknown): BirdTallyFile {
  if (!isObj(data) || data.format !== BACKUP_FORMAT) throw new Error('This is not a BirdTally file.');
  const v = data.formatVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new Error('File is damaged: unknown format version.');
  if (v > BACKUP_FORMAT_VERSION) throw new Error('This file was made by a newer version of BirdTally. Update the app first.');
  for (const key of Object.keys(LABEL) as (keyof typeof LABEL)[]) checkList(key, data[key]);
  const f = data as unknown as BirdTallyFile;
  const sightingIds = new Set(f.sightings.map((s) => s.id));
  f.media.forEach((m, i) => {
    if (!sightingIds.has(m.sightingId)) throw new Error(`File is damaged: Media item ${i + 1} belongs to a sighting that is not in the file.`);
  });
  return f;
}
