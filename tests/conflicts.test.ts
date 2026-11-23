// Settling clashes through the real storage layer (fake-indexeddb).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { validateChecklist } from '../src/core/checklist';
import { newMeta, touch } from '../src/core/records';
import type { Outing, Sighting, Taxon } from '../src/core/types';
import { db } from '../src/db';
import { getSettings, importFile, resolveConflict } from '../src/store';

const T = (hh: number) => `2026-11-20T${String(hh).padStart(2, '0')}:00:00.000Z`;
const taxa = new Map<string, Taxon>([['tui1', { code: 'tui1', sci: 'Prosthemadera novaeseelandiae', en: 'Tui', category: 'species', order: 1, codes: [], names: {} }]]);
const outing: Outing = {
  ...newMeta('phoneA', T(1)),
  id: 'o1',
  origin: 'manual',
  startedAt: T(1),
  tz: 'Pacific/Auckland',
  utcOffsetMin: 780,
  allReported: null,
  countOverrides: {},
  version: 3,
  submission: 'draft',
  protocol: 'Incidental',
  locationName: 'Park'
};
const sighting: Sighting = {
  ...newMeta('phoneA', T(1)),
  id: 's1',
  outingId: 'o1',
  observedAt: T(1),
  tz: 'Pacific/Auckland',
  utcOffsetMin: 780,
  positionStatus: 'ok',
  speciesCode: 'tui1',
  countMode: 'present',
  detection: 'seen',
  mediaIds: [],
  idHistory: [{ at: T(1), speciesCode: 'tui1', source: 'me' }]
};
const fileWith = (over: object) =>
  JSON.stringify({ format: 'birdtally', formatVersion: 2, kind: 'backup', exportedAt: T(9), deviceId: 'phoneB', deviceName: 'B', trips: [], outings: [], sightings: [], media: [], exports: [], conflicts: [], ...over });
const onlyConflict = async () => (await db.conflicts.toArray())[0];

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await getSettings();
});

describe('choosing "Use other" for a birding session', () => {
  it('takes the content but keeps the exported state, so the export warning still shows', async () => {
    await db.outings.put(touch(outing, { version: 6, submission: 'exported', exportedVersion: 6 }, 'phoneA', T(3)));
    await db.sightings.put(sighting);
    await importFile(fileWith({ outings: [touch(outing, { version: 4, comments: 'from phone B' }, 'phoneB', T(2))] }));
    await resolveConflict((await onlyConflict()).id, true);

    const o = (await db.outings.get('o1'))!;
    expect(o).toMatchObject({ comments: 'from phone B', submission: 'exported', exportedVersion: 6, version: 7 });
    expect(validateChecklist(o, await db.sightings.toArray(), taxa).some((i) => i.message.includes('since you exported'))).toBe(true);
    expect((await onlyConflict()).resolved).toBe(true);
  });
});

describe('choosing "Use other" for a sighting', () => {
  it('restores an edit that lost to a later delete, with both ID histories', async () => {
    const edited = touch(sighting, { note: 'pair', speciesCode: 'kea1', idHistory: [...sighting.idHistory, { at: T(2), speciesCode: 'kea1', source: 'me' }] }, 'phoneA', T(2));
    await db.sightings.put(edited);
    await db.outings.put(outing);
    await importFile(fileWith({ sightings: [touch(sighting, { deleted: true }, 'phoneB', T(3))] }));
    expect((await db.sightings.get('s1'))!.deleted).toBe(true);

    await resolveConflict((await onlyConflict()).id, true);
    const s = (await db.sightings.get('s1'))!;
    expect(s).toMatchObject({ note: 'pair', speciesCode: 'kea1' });
    expect(s.deleted).toBeFalsy();
    expect(s.idHistory.map((d) => d.speciesCode)).toEqual(['tui1', 'kea1']);
    expect((await db.outings.get('o1'))!.version).toBe(4); // the checklist changed with it
  });

  it('"Keep current" changes nothing but the conflict', async () => {
    const mine = touch(sighting, { note: 'mine' }, 'phoneA', T(3));
    await db.sightings.put(mine);
    await importFile(fileWith({ sightings: [touch(sighting, { note: 'theirs' }, 'phoneB', T(2))] }));
    await resolveConflict((await onlyConflict()).id, false);
    expect(await db.sightings.get('s1')).toEqual(mine);
    expect((await onlyConflict()).resolved).toBe(true);
  });
});
