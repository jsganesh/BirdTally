// Repository: every user action becomes one immediate local write.
import { currentOffsetMin, currentZone } from './core/geotime';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, mergeRecords, validateFile, type BirdTallyFile, type MediaWithData } from './core/merge';
import type { OutingProposal } from './core/outings';
import { newId, newMeta, touch } from './core/records';
import { mergeLocaleNames, parseEbirdTaxonomyCsv } from './core/taxonomy';
import type { CountMode, Detection, GeoPoint, ID, MediaMeta, Outing, Sighting, Trip } from './core/types';
import { db, type SettingsRow } from './db';

// ---------- settings ----------

export async function getSettings(): Promise<SettingsRow> {
  const s = await db.settings.get('main');
  if (s) return s;
  const fresh: SettingsRow = {
    key: 'main',
    deviceId: newId(),
    deviceName: guessDeviceName(),
    units: 'km',
    displayLocales: ['en'],
    defaultObservers: 1,
    theme: 'auto',
    entriesSinceBackup: 0
  };
  await db.settings.put(fresh);
  return fresh;
}

function guessDeviceName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Device';
}

export async function updateSettings(changes: Partial<SettingsRow>) {
  await getSettings();
  await db.settings.update('main', changes);
}

// ---------- location: one fix per entry, never continuous tracking ----------

export function getPosition(timeoutMs = 15000): Promise<{ pos?: GeoPoint; status: Sighting['positionStatus'] }> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({ status: 'unavailable' });
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          status: 'ok',
          pos: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy), at: new Date(p.timestamp).toISOString() }
        }),
      (e) => resolve({ status: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 }
    );
  });
}

// ---------- sightings ----------

export interface NewSighting {
  speciesCode?: string;
  countMode?: CountMode;
  count?: number;
  detection?: Detection;
  note?: string;
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
    mediaIds: [],
    idHistory: input.speciesCode ? [{ at: iso, speciesCode: input.speciesCode, source: 'me' }] : []
  };
  await db.sightings.put(s);
  await db.settings.where('key').equals('main').modify((row) => void (row.entriesSinceBackup = (row.entriesSinceBackup ?? 0) + 1));
  if (s.outingId) await bumpOuting(s.outingId);
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

// ---------- outings ----------

/** Content of an outing changed: new version; a "ready" checklist goes back to draft. */
async function bumpOutingTx(id: ID, deviceId: string) {
  const o = await db.outings.get(id);
  if (!o) return;
  const changes: Partial<Outing> = { version: o.version + 1 };
  if (o.submission === 'ready') changes.submission = 'draft';
  await db.outings.put(touch(o, changes, deviceId));
}

async function bumpOuting(id: ID) {
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

// ---------- trips ----------

export async function createTrip(name: string, countryCodes: string[]): Promise<Trip> {
  const st = await getSettings();
  const t: Trip = { ...newMeta(st.deviceId), name, countryCodes };
  await db.trips.put(t);
  await db.settings.update('main', { activeTripId: t.id });
  return t;
}

// ---------- taxonomy (offline, downloaded before a trip) ----------

const API = 'https://api.ebird.org/v2';

export async function downloadTaxonomy(locales: string[], onProgress: (msg: string) => void) {
  onProgress('Checking latest taxonomy version…');
  const versions: { authorityVer: number; latest: boolean }[] = await fetch(`${API}/ref/taxonomy/versions`).then((r) => {
    if (!r.ok) throw new Error(`eBird returned ${r.status}`);
    return r.json();
  });
  const version = versions.find((v) => v.latest)?.authorityVer ?? 0;
  onProgress(`Downloading eBird taxonomy ${version} (English)…`);
  const en = await fetch(`${API}/ref/taxonomy/ebird?fmt=csv&locale=en&version=${version}`).then((r) => {
    if (!r.ok) throw new Error(`eBird returned ${r.status}`);
    return r.text();
  });
  const taxa = parseEbirdTaxonomyCsv(en);
  for (const l of locales.filter((x) => x !== 'en')) {
    onProgress(`Downloading names: ${l}…`);
    const csv = await fetch(`${API}/ref/taxonomy/ebird?fmt=csv&locale=${encodeURIComponent(l)}&version=${version}`).then((r) => {
      if (!r.ok) throw new Error(`eBird returned ${r.status} for locale ${l}`);
      return r.text();
    });
    mergeLocaleNames(taxa, l, csv);
  }
  await db.taxonomy.put({ key: 'current', version, locales: ['en', ...locales.filter((x) => x !== 'en')], downloadedAt: new Date().toISOString(), count: taxa.length, taxa });
  await updateSettings({ displayLocales: ['en', ...locales.filter((x) => x !== 'en')] });
  onProgress(`Saved ${taxa.length.toLocaleString()} taxa (version ${version}).`);
}

/** Optional: likely species for a region. Needs the user's own eBird API key. */
export async function downloadRegionList(region: string, apiKey: string) {
  const r = await fetch(`${API}/product/spplist/${encodeURIComponent(region)}`, { headers: { 'x-ebirdapitoken': apiKey } });
  if (!r.ok) throw new Error(r.status === 403 ? 'eBird refused the API key.' : `eBird returned ${r.status}`);
  const codes: string[] = await r.json();
  await db.tripLists.put({ key: region.toUpperCase(), codes, downloadedAt: new Date().toISOString() });
  return codes.length;
}

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

export interface ImportSummary {
  added: number;
  updated: number;
  conflicts: number;
  from: string;
}

/** Merge a BirdTally file (backup or trip file from another device) into this device. */
export async function importFile(text: string): Promise<ImportSummary> {
  const f = validateFile(JSON.parse(text));
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

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
