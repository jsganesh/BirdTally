import { currentOffsetMin, currentZone } from '../core/geotime';
import type { OutingProposal } from '../core/outings';
import { newMeta, touch } from '../core/records';
import type { ID, Outing } from '../core/types';
import { db } from '../db';
import { getPosition, getSettings } from './settings';


// ---------- outings ----------

// Functions ending in Tx run inside the caller's transaction, so one user action is one write.

/** Edit an outing. A content change gives it a new version and sends a "ready" checklist back to draft. */
export async function editOutingTx(id: ID, changes: Partial<Outing>, deviceId: string, contentChange = true) {
  const o = await db.outings.get(id);
  if (!o) return;
  const extra: Partial<Outing> = {};
  if (contentChange) {
    extra.version = o.version + 1;
    if (o.submission === 'ready') extra.submission = 'draft';
  }
  await db.outings.put(touch(o, { ...changes, ...extra }, deviceId));
}

export const bumpOutingTx = (id: ID, deviceId: string) => editOutingTx(id, {}, deviceId);

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
  await db.transaction('rw', db.outings, db.settings, async () => {
    await db.outings.put(o);
    await db.settings.update('main', { activeOutingId: o.id });
  });
  void getPosition().then(({ pos }) =>
    db.transaction('rw', db.outings, async () => {
      const cur = await db.outings.get(o.id);
      if (cur && pos && !cur.startPosition) await db.outings.put(touch(cur, { startPosition: pos }, st.deviceId));
    })
  );
  return o;
}

export async function stopOuting() {
  const { deviceId } = await getSettings();
  await db.transaction('rw', db.outings, db.settings, async () => {
    const activeId = (await db.settings.get('main'))?.activeOutingId;
    if (!activeId) return;
    const o = await db.outings.get(activeId);
    if (o) {
      const endedAt = new Date().toISOString();
      const durationMin = Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(o.startedAt)) / 60000));
      await db.outings.put(touch(o, { endedAt, durationMin: Math.min(durationMin, 1439) }, deviceId));
    }
    await db.settings.update('main', { activeOutingId: undefined });
  });
}

export async function updateOuting(id: ID, changes: Partial<Outing>, contentChange = true) {
  const { deviceId } = await getSettings();
  await db.transaction('rw', db.outings, () => editOutingTx(id, changes, deviceId, contentChange));
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
  const { deviceId } = await getSettings();
  return db.transaction('rw', db.outings, db.sightings, async () => {
    const o = await db.outings.get(outingId);
    const pivot = await db.sightings.get(sightingId);
    if (!o || !pivot) return;
    const moving = (await db.sightings.where('outingId').equals(outingId).toArray()).filter((s) => !s.deleted && s.observedAt >= pivot.observedAt);
    const origin = o.origin === 'tapped' ? 'manual' : o.origin;
    const n: Outing = {
      ...o,
      ...newMeta(deviceId),
      origin,
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
    await db.outings.put(n);
    for (const s of moving) await db.sightings.put(touch(s, { outingId: n.id }, deviceId));
    // The tapped start/stop no longer describes either half, so effort must be re-entered.
    await editOutingTx(outingId, { endedAt: undefined, durationMin: undefined, distanceKm: undefined, origin }, deviceId);
    return n;
  });
}

/** Merge outing b into a (same date required by the caller's UI). */
export async function mergeOutings(aId: ID, bId: ID) {
  const { deviceId } = await getSettings();
  await db.transaction('rw', db.outings, db.sightings, async () => {
    const b = await db.outings.get(bId);
    if (!b) return;
    for (const s of await db.sightings.where('outingId').equals(bId).toArray()) await db.sightings.put(touch(s, { outingId: aId }, deviceId));
    await db.outings.put(touch(b, { deleted: true }, deviceId));
    await bumpOutingTx(aId, deviceId);
  });
}
