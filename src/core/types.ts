// Domain model. Pure data: no browser APIs here so the same rules run on every platform.
//
// The sighting is the permanent record. Outings group sightings; an outing becomes an
// eBird checklist only when the user reviews it. Media (voice notes, phone photos) are
// linked to sightings, never the other way round.

export type ID = string;

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM?: number;
  /** ISO time the fix was taken. */
  at: string;
}

export type CountMode = 'exact' | 'estimate' | 'present';
export type Detection = 'seen' | 'heard' | 'both';
export type PositionStatus = 'pending' | 'ok' | 'unavailable' | 'denied';

export interface IdDecision {
  at: string;
  /** undefined = cleared back to pending */
  speciesCode?: string;
  source: 'me' | 'merlin-noted';
  note?: string;
  taxonomyVersion?: number;
}

/** Fields every synced record carries. */
export interface RecordMeta {
  id: ID;
  createdAt: string;
  updatedAt: string;
  /** Device that made the most recent edit. */
  deviceId: string;
  deleted?: boolean;
  /** Earlier `updatedAt` stamps of this record (most recent last, capped). Lets a merge tell
   *  a simple newer version apart from two devices editing the same record independently. */
  history?: string[];
}

export interface Sighting extends RecordMeta {
  tripId?: ID;
  /** null/undefined = not yet in an outing; the app proposes outings for these. */
  outingId?: ID | null;
  observedAt: string; // ISO, UTC
  tz: string; // IANA zone of the device when recorded
  utcOffsetMin: number; // offset at observedAt, minutes east of UTC
  position?: GeoPoint;
  positionStatus: PositionStatus;
  /** Absent while identification is pending. */
  speciesCode?: string;
  countMode: CountMode;
  count?: number;
  detection: Detection;
  note?: string;
  /** What Merlin suggested, typed by the user. Never synced from Merlin. */
  merlinSuggestion?: string;
  possibleCaptive?: boolean;
  /** Recorded after a warning that the bird is not on the trip's regional species lists. */
  unusualHere?: boolean;
  mediaIds: ID[];
  idHistory: IdDecision[];
}

export type Protocol = 'Incidental' | 'Stationary' | 'Traveling' | 'Historical';
export type AllReported = 'yes' | 'no' | null;
export type SubmissionState = 'draft' | 'ready' | 'exported' | 'submitted' | 'needs_correction';

export interface Outing extends RecordMeta {
  tripId?: ID;
  /** How the outing came to exist: tapped Start, or confirmed from a proposal. */
  origin: 'tapped' | 'confirmed-proposal' | 'manual';
  /** For tapped outings: the real start/end the user tapped. For confirmed proposals:
   *  the first/last entry time — evidence only, so duration is left for the user. */
  startedAt: string;
  endedAt?: string;
  tz: string;
  utcOffsetMin: number;
  startPosition?: GeoPoint;
  locationName?: string;
  countryCode?: string;
  stateCode?: string;
  protocol?: Protocol;
  durationMin?: number;
  /** Always stored in km; converted to miles only in the eBird file. */
  distanceKm?: number;
  observers?: number;
  allReported: AllReported;
  comments?: string;
  /** Per-species count chosen at review: number or 'X'. Overrides the aggregate. */
  countOverrides: Record<string, number | 'X'>;
  /** Increases on every edit that changes checklist content. */
  version: number;
  submission: SubmissionState;
  exportedVersion?: number;
  ebirdChecklistId?: string; // e.g. S123456789
}

export interface Trip extends RecordMeta {
  name: string;
  countryCodes: string[];
  startDate?: string;
  endDate?: string;
}

/** A region's bounding box in degrees (eBird's `bounds`). minX greater than maxX means the box crosses the antimeridian. */
export interface GeoBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface MediaMeta extends RecordMeta {
  sightingId: ID;
  kind: 'audio' | 'photo';
  mime: string;
  bytes: number;
  capturedAt: string;
  durationSec?: number;
}

export interface ExportRecord {
  id: ID;
  createdAt: string;
  fileName: string;
  sha256: string;
  bytes: number;
  rows: number;
  outings: { outingId: ID; version: number }[];
}

export interface Conflict {
  id: ID;
  table: 'sightings' | 'outings' | 'trips';
  recordId: ID;
  kept: unknown;
  other: unknown;
  detectedAt: string;
  resolved?: boolean;
}

export interface Taxon {
  code: string;
  sci: string;
  /** eBird English common name — the name written to eBird files. */
  en: string;
  category: string;
  order: number;
  family?: string;
  /** 4-letter and 6-letter codes from COM_NAME_CODES, SCI_NAME_CODES, BANDING_CODES. */
  codes: string[];
  reportAs?: string;
  extinct?: boolean;
  /** Extra common names by eBird locale, e.g. { mi: ['Tūī', 'Tui'] }. */
  names: Record<string, string[]>;
}

export interface TaxonomyInfo {
  version: number;
  locales: string[];
  downloadedAt: string;
  count: number;
}

export interface Settings {
  deviceId: string;
  deviceName: string;
  units: 'km' | 'mi';
  displayLocales: string[]; // name languages to show, e.g. ['en', 'mi']
  defaultObservers: number;
  ebirdApiKey?: string;
  theme: 'auto' | 'light' | 'dark';
  lastBackupAt?: string;
  entriesSinceBackup: number;
}
