import Dexie, { type Table } from 'dexie';
import type { Conflict, ExportRecord, GeoBounds, MediaMeta, Outing, Settings, Sighting, Taxon, TaxonomyInfo, Trip } from './core/types';

export interface TaxonomyBlob extends TaxonomyInfo {
  key: 'current';
  taxa: Taxon[];
}
export interface TripList {
  key: string; // region code, e.g. NZ
  codes: string[];
  downloadedAt: string;
  /** undefined: not fetched yet. null: eBird has no box for this region, so the GPS cross-check stays off for it. */
  bounds?: GeoBounds | null;
}
export interface SettingsRow extends Settings {
  key: 'main';
  activeOutingId?: string;
  activeTripId?: string;
}

/** Local database: the primary working copy. Every write goes here first. */
class BirdTallyDB extends Dexie {
  settings!: Table<SettingsRow, string>;
  taxonomy!: Table<TaxonomyBlob, string>;
  tripLists!: Table<TripList, string>;
  trips!: Table<Trip, string>;
  outings!: Table<Outing, string>;
  sightings!: Table<Sighting, string>;
  media!: Table<MediaMeta, string>;
  mediaBlobs!: Table<{ id: string; blob: Blob }, string>;
  exports!: Table<ExportRecord, string>;
  conflicts!: Table<Conflict, string>;

  constructor(name = 'birdtally') {
    super(name);
    this.version(1).stores({
      settings: 'key',
      taxonomy: 'key',
      tripLists: 'key',
      trips: 'id, updatedAt',
      outings: 'id, startedAt, tripId, submission, updatedAt',
      sightings: 'id, observedAt, outingId, speciesCode, tripId, updatedAt',
      media: 'id, sightingId',
      mediaBlobs: 'id',
      exports: 'id, createdAt',
      conflicts: 'id, recordId, resolved'
    });
  }
}

export const db = new BirdTallyDB();
