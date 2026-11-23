import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, mergeRecords, type BirdTallyFile, type MediaWithData } from '../core/merge';
import { validateFile } from '../core/validate';
import { newId, touch } from '../core/records';
import type { ID, Outing, Sighting, Trip } from '../core/types';
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
    exports: await db.exports.toArray()
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
    for (const [table, incoming] of [
      ['trips', f.trips],
      ['outings', f.outings],
      ['sightings', f.sightings]
    ] as const) {
      const t = db[table] as unknown as import('dexie').Table<(typeof incoming)[number], string>;
      const local = await t.bulkGet(incoming.map((r) => r.id));
      const r = mergeRecords(local.filter((x): x is NonNullable<typeof x> => !!x), incoming as never[]);
      if (r.upserts.length) await t.bulkPut(r.upserts);
      sum.added += r.added;
      sum.updated += r.updated;
      for (const c of r.conflicts) {
        await db.conflicts.put({ id: newId(), table, recordId: (c.kept as { id: string }).id, kept: c.kept, other: c.other, detectedAt: new Date().toISOString() });
        sum.conflicts++;
      }
    }
    for (const m of f.media) {
      if (await db.media.get(m.id)) continue;
      const { dataBase64, ...meta } = m;
      await db.mediaBlobs.put({ id: m.id, blob: base64ToBlob(dataBase64, m.mime) });
      await db.media.put(meta);
      sum.added++;
    }
    for (const e of f.exports) if (!(await db.exports.get(e.id))) await db.exports.put(e);
  });
  return sum;
}

export async function resolveConflict(conflictId: ID, useOther: boolean) {
  const c = await db.conflicts.get(conflictId);
  if (!c) return;
  if (useOther) {
    const st = await getSettings();
    const t = db[c.table] as unknown as import('dexie').Table<Sighting | Outing | Trip, string>;
    const cur = await t.get(c.recordId);
    const other = c.other as Sighting | Outing | Trip;
    if (cur) await t.put(touch(cur, { ...other, id: cur.id } as never, st.deviceId));
  }
  await db.conflicts.update(conflictId, { resolved: true });
}
