import type { ExportRecord, MediaMeta, Outing, RecordMeta, Sighting, Trip } from './types';

export const BACKUP_FORMAT = 'birdtally';
export const BACKUP_FORMAT_VERSION = 1;

export interface MediaWithData extends MediaMeta {
  dataBase64: string;
}

/** Open, documented JSON file used for trip transfer between devices and for backups. */
export interface BirdTallyFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  kind: 'backup' | 'trip';
  exportedAt: string;
  deviceId: string;
  deviceName: string;
  taxonomyVersion?: number;
  trips: Trip[];
  outings: Outing[];
  sightings: Sighting[];
  media: MediaWithData[];
  exports: ExportRecord[];
}

export interface MergeResult<T> {
  upserts: T[];
  conflicts: { kept: T; other: T }[];
  added: number;
  updated: number;
  unchanged: number;
}

function sameContent(a: RecordMeta, b: RecordMeta): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Merge incoming records into local ones.
 *  - New id → added.
 *  - Same id, same content → unchanged.
 *  - Same id, one version built on the other (its `history` contains the other's
 *    `updatedAt`) → the descendant wins, no conflict.
 *  - Same id, edited independently on two devices → the later edit wins and the other
 *    version is kept as a conflict for the user to review, never silently dropped.
 * Deletions travel as tombstones (`deleted: true`), so a delete on one phone reaches the other;
 * a delete that clashes with an independent edit is kept for review like any other clash.
 */
export function mergeRecords<T extends RecordMeta>(local: T[], incoming: T[]): MergeResult<T> {
  const byId = new Map(local.map((r) => [r.id, r]));
  const res: MergeResult<T> = { upserts: [], conflicts: [], added: 0, updated: 0, unchanged: 0 };
  for (const inc of incoming) {
    const cur = byId.get(inc.id);
    if (!cur) {
      res.upserts.push(inc);
      res.added++;
      continue;
    }
    if (sameContent(cur, inc)) {
      res.unchanged++;
      continue;
    }
    const incDescends = (inc.history ?? []).includes(cur.updatedAt);
    const curDescends = (cur.history ?? []).includes(inc.updatedAt);
    if (curDescends && !incDescends) {
      res.unchanged++; // local already contains this edit
      continue;
    }
    if (incDescends && !curDescends) {
      res.upserts.push(inc); // fast-forward: incoming built on top of our version
      res.updated++;
      continue;
    }
    // Edited independently on two devices (or no history): later edit wins, other kept for review.
    // A delete on one phone and an edit on the other is a clash too: whichever loses must stay
    // reviewable, or the edit (or the delete) disappears without the user ever seeing it.
    const incomingNewer = inc.updatedAt > cur.updatedAt;
    const kept = incomingNewer ? inc : cur;
    const other = incomingNewer ? cur : inc;
    if (incomingNewer) {
      res.upserts.push(inc);
      res.updated++;
    } else res.unchanged++;
    if (!(kept.deleted && other.deleted)) res.conflicts.push({ kept, other });
  }
  return res;
}

export function validateFile(data: unknown): BirdTallyFile {
  const f = data as BirdTallyFile;
  if (!f || f.format !== BACKUP_FORMAT) throw new Error('This is not a BirdTally file.');
  if (typeof f.formatVersion !== 'number' || f.formatVersion > BACKUP_FORMAT_VERSION)
    throw new Error('This file was made by a newer version of BirdTally. Update the app first.');
  for (const k of ['trips', 'outings', 'sightings', 'media', 'exports'] as const)
    if (!Array.isArray(f[k])) throw new Error(`File is damaged: "${k}" is missing.`);
  return f;
}
