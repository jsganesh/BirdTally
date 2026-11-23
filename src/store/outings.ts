import { currentOffsetMin, currentZone } from '../core/geotime';
import type { OutingProposal } from '../core/outings';
import { newMeta, touch } from '../core/records';
import type { ID, Outing } from '../core/types';
import { db } from '../db';
import { getPosition, getSettings } from './settings';


// ---------- outings ----------

/** Content of an outing changed: new version; a "ready" checklist goes back to draft. */
export async function bumpOutingTx(id: ID, deviceId: string) {
  const o = await db.outings.get(id);
  if (!o) return;
  const changes: Partial<Outing> = { version: o.version + 1 };
  if (o.submission === 'ready') changes.submission = 'draft';
  await db.outings.put(touch(o, changes, deviceId));
}

export async function bumpOuting(id: ID) {
  const { deviceId } = await getSettings();
  await db.transaction('rw', db.outings, () => bumpOutingTx(id, deviceId));
}

export async function startOuting(): Promise<Outing> {
  const st = await getSettings();
  const now = new Date();
  const o: Outing = {
    ...newMeta(st.deviceId, now.toISOString()),
    tripId: st.activeTripId,
    origin: 'tapped',
    startedAt: now.toISOString(),
    tz: currentZone(),
    utcOffsetMin: currentOffsetMin(now),
    allReported: null,
    countOverrides: {},
    version: 1,
    submission: 'draft',
    observers: st.defaultObservers
  };
  await db.outings.put(o);
  await db.settings.update('main', { activeOutingId: o.id });
  void getPosition().then(({ pos }) =>
    db.transaction('rw', db.outings, async () => {
      const cur = await db.outings.get(o.id);
      if (cur && pos && !cur.startPosition) await db.outings.put(touch(cur, { startPosition: pos }, st.deviceId));
    })
  );
  return o;
}

export async function stopOuting() {
  const st = await getSettings();
  if (!st.activeOutingId) return;
  await db.transaction('rw', db.outings, async () => {
    const o = await db.outings.get(st.activeOutingId!);
    if (!o) return;
    const endedAt = new Date().toISOString();
    const durationMin = Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(o.startedAt)) / 60000));
    await db.outings.put(touch(o, { endedAt, durationMin: Math.min(durationMin, 1439) }, st.deviceId));
  });
  await db.settings.update('main', { activeOutingId: undefined });
}

export async function updateOuting(id: ID, changes: Partial<Outing>, contentChange = true) {
  const { deviceId } = await getSettings();
  await db.transaction('rw', db.outings, async () => {
    const o = await db.outings.get(id);
    if (!o) return;
    const extra: Partial<Outing> = {};
    if (contentChange) {
      extra.version = o.version + 1;
      if (o.submission === 'ready') extra.submission = 'draft';
    }
    await db.outings.put(touch(o, { ...changes, ...extra }, deviceId));
  });
}

/** Turn a proposal into an outing. Its times come from entries, so effort is left blank. */
export async function confirmProposal(p: OutingProposal): Promise<Outing> {
  const st = await getSettings();
  const first = await db.sightings.get(p.sightingIds[0]);
  const o: Outing = {
    ...newMeta(st.deviceId),
    tripId: first?.tripId,
    origin: 'confirmed-proposal',
    startedAt: p.firstAt,
    endedAt: p.lastAt,
    tz: p.tz,
    utcOffsetMin: p.utcOffsetMin,
    allReported: null,
    countOverrides: {},
    version: 1,
    submission: 'draft',
    observers: st.defaultObservers,
    protocol: 'Incidental'
  };
  await db.transaction('rw', db.outings, db.sightings, async () => {
    await db.outings.put(o);
    for (const id of p.sightingIds) {
      const s = await db.sightings.get(id);
      if (s) await db.sightings.put(touch(s, { outingId: o.id }, st.deviceId));
    }
  });
  return o;
}

/** Move this entry and every later entry of the outing into a new outing. */
export async function splitOutingAt(outingId: ID, sightingId: ID) {
  const st = await getSettings();
  const o = await db.outings.get(outingId);
  const pivot = await db.sightings.get(sightingId);
  if (!o || !pivot) return;
  const moving = (await db.sightings.where('outingId').equals(outingId).toArray()).filter((s) => !s.deleted && s.observedAt >= pivot.observedAt);
  const n: Outing = {
    ...o,
    ...newMeta(st.deviceId),
    origin: o.origin === 'tapped' ? 'manual' : o.origin,
    startedAt: pivot.observedAt,
    tz: pivot.tz,
    utcOffsetMin: pivot.utcOffsetMin,
    startPosition: pivot.position,
    durationMin: undefined,
    distanceKm: undefined,
    allReported: null,
    countOverrides: {},
    version: 1,
    submission: 'draft',
    exportedVersion: undefined,
    ebirdChecklistId: undefined,
    locationName: undefined
  };
  await db.transaction('rw', db.outings, db.sightings, async () => {
    await db.outings.put(n);
    for (const s of moving) await db.sightings.put(touch(s, { outingId: n.id }, st.deviceId));
  });
  // The tapped start/stop no longer describes either half, so effort must be re-entered.
  await updateOuting(outingId, { endedAt: undefined, durationMin: undefined, distanceKm: undefined, origin: o.origin === 'tapped' ? 'manual' : o.origin });
  return n;
}

/** Merge outing b into a (same date required by the caller's UI). */
export async function mergeOutings(aId: ID, bId: ID) {
  const st = await getSettings();
  const b = await db.outings.get(bId);
  if (!b) return;
  const moving = await db.sightings.where('outingId').equals(bId).toArray();
  await db.transaction('rw', db.outings, db.sightings, async () => {
    for (const s of moving) await db.sightings.put(touch(s, { outingId: aId }, st.deviceId));
    await db.outings.put(touch(b, { deleted: true }, st.deviceId));
  });
  await updateOuting(aId, {});
}
