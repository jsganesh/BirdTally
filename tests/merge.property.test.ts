// Property tests for merging two phones' files: random edit/delete histories, checked against the
// rules every merge must keep. Seeded, so a failure names a seed that reproduces it.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { conflictId, mergeRecords } from '../src/core/merge';
import { newMeta, touch } from '../src/core/records';
import type { Sighting } from '../src/core/types';
import { db } from '../src/db';
import { getSettings, importFile } from '../src/store';

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function baseSighting(id: string): Sighting {
  return { ...newMeta('phoneA', '2026-11-20T00:00:00.000Z'), id, outingId: null, observedAt: '2026-11-20T00:00:00.000Z', tz: 'UTC', utcOffsetMin: 0, positionStatus: 'ok', speciesCode: 'tui1', countMode: 'present', detection: 'seen', mediaIds: [], idHistory: [] };
}

/** Both phones start from the same records, then each edits or deletes some on its own. */
function scenario(seed: number) {
  const r = rng(seed);
  const shared = Array.from({ length: 6 }, (_, i) => baseSighting(`s${i}`));
  let clock = Date.parse('2026-11-20T01:00:00.000Z');
  const phone = (device: string) => {
    const recs = new Map(shared.map((s) => [s.id, s]));
    for (let k = 0, n = Math.floor(r() * 12); k < n; k++) {
      const cur = recs.get(`s${Math.floor(r() * shared.length)}`)!;
      clock += 1 + Math.floor(r() * 60_000);
      const change: Partial<Sighting> = r() < 0.2 ? { deleted: !cur.deleted } : { note: `${device}-${k}`, count: Math.floor(r() * 9) };
      recs.set(cur.id, touch(cur, change, device, new Date(clock).toISOString()));
    }
    if (r() < 0.3) recs.set(`new-${device}`, { ...baseSighting(`new-${device}`), deviceId: device });
    return [...recs.values()];
  };
  return { a: phone('phoneA'), b: phone('phoneB') };
}

const apply = (local: Sighting[], upserts: Sighting[]) => {
  const m = new Map(local.map((s) => [s.id, s]));
  for (const u of upserts) m.set(u.id, u);
  return m;
};
const descends = (x: Sighting, y: Sighting) => (x.history ?? []).includes(y.updatedAt);
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe('merging two phones (300 random histories)', () => {
  it.each(SEEDS)('seed %i: same result either way, nothing dropped unseen, re-import is a no-op', (seed) => {
    const { a, b } = scenario(seed);
    const ab = mergeRecords(a, b);
    const ba = mergeRecords(b, a);
    const onA = apply(a, ab.upserts);
    const onB = apply(b, ba.upserts);

    // 1. Both phones end with the same record for every id.
    expect([...onA.entries()].sort()).toEqual([...onB.entries()].sort());

    // 2. Where the phones disagreed independently, the losing version is in a conflict.
    const ids = (r: typeof ab) => new Set(r.conflicts.map((c) => conflictId('sightings', c.kept.id, c.kept, c.other)));
    const bById = new Map(b.map((s) => [s.id, s]));
    for (const x of a) {
      const y = bById.get(x.id);
      if (!y || JSON.stringify(x) === JSON.stringify(y) || descends(x, y) || descends(y, x) || (x.deleted && y.deleted)) continue;
      const kept = onA.get(x.id)!;
      const lost = kept === x ? y : x;
      expect(ab.conflicts.some((c) => c.other === lost)).toBe(true);
    }

    // 3. Either order names the same clashes, so each is stored once on both phones.
    expect(ids(ab)).toEqual(ids(ba));

    // 4. Merging the same file again changes no record.
    expect(mergeRecords([...onA.values()], b).upserts).toEqual([]);
  });
});

describe('importing through storage (40 random histories)', () => {
  it.each(SEEDS.slice(0, 40))('seed %i: stored result matches, and importing twice adds nothing', async (seed) => {
    const { a, b } = scenario(seed);
    await Promise.all(db.tables.map((t) => t.clear()));
    await getSettings();
    await db.sightings.bulkPut(a);
    const fileB = JSON.stringify({ format: 'birdtally', formatVersion: 2, kind: 'trip', exportedAt: '2026-11-21T00:00:00.000Z', deviceId: 'phoneB', deviceName: 'B', trips: [], outings: [], sightings: b, media: [], exports: [], conflicts: [] });

    const first = await importFile(fileB);
    const expected = mergeRecords(a, b);
    expect(first.conflicts).toBe(expected.conflicts.length);
    const stored = new Map((await db.sightings.toArray()).map((s) => [s.id, s]));
    expect(stored).toEqual(apply(a, expected.upserts));

    const again = await importFile(fileB);
    expect(again).toMatchObject({ added: 0, updated: 0, conflicts: 0 });
    expect(await db.conflicts.count()).toBe(expected.conflicts.length);
  });
});
