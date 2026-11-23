import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, conflictId, mergeRecords, type BirdTallyFile, type MediaWithData } from '../core/merge';
import { validateFile } from '../core/validate';
import type { Conflict, Outing, Sighting, Trip } from '../core/types';
import { db } from '../db';
import { getSettings, updateSettings } from './settings';


// ---------- backup / trip files ----------

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: mime });
}

export async function buildBackup(kind: 'backup' | 'trip' = 'backup'): Promise<BirdTallyFile> {
  const st = await getSettings();
  const tax = await db.taxonomy.get('current');
  const media: MediaWithData[] = [];
  for (const m of await db.media.toArray()) {
    const b = await db.mediaBlobs.get(m.id);
    if (b) media.push({ ...m, dataBase64: await blobToBase64(b.blob) });
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    kind,
    exportedAt: new Date().toISOString(),
    deviceId: st.deviceId,
    deviceName: st.deviceName,
    taxonomyVersion: tax?.version,
    trips: await db.trips.toArray(),
    outings: await db.outings.toArray(),
    sightings: await db.sightings.toArray(),
    media,
    exports: await db.exports.toArray(),
    conflicts: await db.conflicts.toArray()
  };
}

export async function markBackedUp() {
  await updateSettings({ lastBackupAt: new Date().toISOString(), entriesSinceBackup: 0 });
}

/** Larger files risk exceeding the browser's string limit while parsing, on phones especially. */
export const MAX_IMPORT_BYTES = 400_000_000;

export interface ImportSummary {
  added: number;
  updated: number;
  conflicts: number;
  from: string;
}

/** Merge a BirdTally file (backup or trip file from another device) into this device. */
export async function importFile(text: string): Promise<ImportSummary> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not a BirdTally file (it is not valid JSON).');
  }
  const f = validateFile(parsed);
  const sum: ImportSummary = { added: 0, updated: 0, conflicts: 0, from: f.deviceName };
  await db.transaction('rw', [db.trips, db.outings, db.sightings, db.media, db.mediaBlobs, db.exports, db.conflicts], async () => {
    for (const table of ['trips', 'outings', 'sightings'] as const) await mergeTable(table, f[table], sum);
    await importMedia(f, sum);
    for (const e of f.exports) if (!(await db.exports.get(e.id))) await db.exports.put(e);
    for (const c of f.conflicts ?? []) await addConflict(c, sum);
  });
  return sum;
}

async function mergeTable(table: Conflict['table'], incoming: (Trip | Outing | Sighting)[], sum: ImportSummary) {
  const t = db[table] as unknown as import('dexie').Table<Trip | Outing | Sighting, string>;
  const local = await t.bulkGet(incoming.map((r) => r.id));
  const r = mergeRecords(local.filter((x) => !!x), incoming);
  if (r.upserts.length) await t.bulkPut(r.upserts);
  sum.added += r.added;
  sum.updated += r.updated;
  for (const { kept, other } of r.conflicts)
    await addConflict({ id: conflictId(table, kept.id, kept, other), table, recordId: kept.id, kept, other, detectedAt: new Date().toISOString() }, sum);
}

async function importMedia(f: BirdTallyFile, sum: ImportSummary) {
  for (const m of f.media) {
    if (await db.media.get(m.id)) continue;
    const { dataBase64, ...meta } = m;
    await db.mediaBlobs.put({ id: m.id, blob: base64ToBlob(dataBase64, m.mime) });
    await db.media.put(meta);
    sum.added++;
  }
}

/** Store a clash once; a clash already resolved on either device stays resolved. */
async function addConflict(c: Conflict, sum: ImportSummary) {
  const existing = await db.conflicts.get(c.id);
  if (!existing) {
    await db.conflicts.put(c);
    if (!c.resolved) sum.conflicts++;
  } else if (c.resolved && !existing.resolved) await db.conflicts.update(c.id, { resolved: true });
}
