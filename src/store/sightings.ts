import { currentOffsetMin, currentZone } from '../core/geotime';
import { newMeta, touch } from '../core/records';
import type { CountMode, Detection, ID, MediaMeta, Sighting } from '../core/types';
import { db } from '../db';
import { bumpOutingTx } from './outings';
import { getPosition, getSettings } from './settings';


// ---------- sightings ----------

export interface NewSighting {
  speciesCode?: string;
  countMode?: CountMode;
  count?: number;
  detection?: Detection;
  note?: string;
  unusualHere?: boolean;
}

/** Save immediately (no waiting for GPS); the position is filled in when it arrives. */
export async function addSighting(input: NewSighting): Promise<Sighting> {
  const st = await getSettings();
  const now = new Date();
  const iso = now.toISOString();
  const s: Sighting = {
    ...newMeta(st.deviceId, iso),
    tripId: st.activeTripId,
    outingId: st.activeOutingId ?? null,
    observedAt: iso,
    tz: currentZone(),
    utcOffsetMin: currentOffsetMin(now),
    positionStatus: 'pending',
    speciesCode: input.speciesCode,
    countMode: input.countMode ?? 'present',
    count: input.count,
    detection: input.detection ?? 'seen',
    note: input.note,
    unusualHere: input.unusualHere,
    mediaIds: [],
    idHistory: input.speciesCode ? [{ at: iso, speciesCode: input.speciesCode, source: 'me' }] : []
  };
  await db.transaction('rw', db.sightings, db.settings, db.outings, async () => {
    await db.sightings.put(s);
    await db.settings.where('key').equals('main').modify((row) => void (row.entriesSinceBackup = (row.entriesSinceBackup ?? 0) + 1));
    if (s.outingId) await bumpOutingTx(s.outingId, st.deviceId);
  });
  void getPosition().then(({ pos, status }) =>
    db.transaction('rw', db.sightings, async () => {
      const cur = await db.sightings.get(s.id);
      if (cur && cur.positionStatus === 'pending') await db.sightings.put(touch(cur, { position: pos, positionStatus: status }, st.deviceId));
    })
  );
  return s;
}

// Every read-modify-write runs inside a transaction so two quick edits (e.g. typing a field
// and immediately tapping a button) are applied one after the other instead of overwriting.
export async function updateSighting(id: ID, changes: Partial<Sighting>) {
  const { deviceId } = await getSettings();
  await db.transaction('rw', db.sightings, db.outings, async () => {
    const cur = await db.sightings.get(id);
    if (!cur) return;
    const next = { ...changes };
    if ('speciesCode' in changes && changes.speciesCode !== cur.speciesCode)
      next.idHistory = [...cur.idHistory, { at: new Date().toISOString(), speciesCode: changes.speciesCode, source: 'me' }];
    await db.sightings.put(touch(cur, next, deviceId));
    if (cur.outingId) await bumpOutingTx(cur.outingId, deviceId);
    if (changes.outingId && changes.outingId !== cur.outingId) await bumpOutingTx(changes.outingId, deviceId);
  });
}

/**
 * A GPS fix that was still pending when the app closed never arrives, so its entry would say
 * "Getting GPS…" forever. Fixes get 15 s, so anything pending for minutes is over.
 */
export async function settleStalePositions(now = Date.now(), staleMs = 5 * 60_000) {
  const { deviceId } = await getSettings();
  await db.transaction('rw', db.sightings, async () => {
    const stale = (await db.sightings.toArray()).filter((s) => s.positionStatus === 'pending' && now - Date.parse(s.createdAt) > staleMs);
    for (const s of stale) await db.sightings.put(touch(s, { positionStatus: 'unavailable' }, deviceId));
  });
}

export async function deleteSighting(id: ID) {
  await updateSighting(id, { deleted: true });
}

export async function restoreSighting(id: ID) {
  await updateSighting(id, { deleted: false });
}

// ---------- media (voice notes, phone photos) ----------

export async function addMedia(sightingId: ID, blob: Blob, kind: 'audio' | 'photo', durationSec?: number) {
  const st = await getSettings();
  const meta: MediaMeta = {
    ...newMeta(st.deviceId),
    sightingId,
    kind,
    mime: blob.type || (kind === 'audio' ? 'audio/mp4' : 'image/jpeg'),
    bytes: blob.size,
    capturedAt: new Date().toISOString(),
    durationSec
  };
  await db.transaction('rw', db.media, db.mediaBlobs, db.sightings, async () => {
    await db.mediaBlobs.put({ id: meta.id, blob });
    await db.media.put(meta);
    const s = await db.sightings.get(sightingId);
    if (s) await db.sightings.put(touch(s, { mediaIds: [...s.mediaIds, meta.id] }, st.deviceId));
  });
  return meta;
}
