// Deleting a checklist: its birds are kept unless named, nothing is erased for good, and the
// whole action is one write.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proposeOutings } from '../src/core/outings';
import { db } from '../src/db';
import { addSighting, deleteOuting, getSettings, restoreSighting, startOuting, stopOuting } from '../src/store';

const settle = () => new Promise((r) => setTimeout(r, 20)); // let background GPS fill-ins finish first

async function checklistWithBirds(n: number) {
  const o = await startOuting();
  const birds = [];
  for (let i = 0; i < n; i++) birds.push(await addSighting({ speciesCode: `bird${i}` }));
  await stopOuting();
  await settle();
  return { o, birds };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await getSettings();
});
afterEach(() => vi.restoreAllMocks());

describe('deleteOuting', () => {
  it('keeps every bird, unassigned, when none are named', async () => {
    const { o, birds } = await checklistWithBirds(3);
    await deleteOuting(o.id);
    expect((await db.outings.get(o.id))!.deleted).toBe(true);
    for (const b of birds) {
      const s = (await db.sightings.get(b.id))!;
      expect(s.deleted).toBeFalsy();
      expect(s.outingId).toBeNull();
    }
    const live = (await db.sightings.toArray()).filter((s) => !s.deleted);
    expect(proposeOutings(live)).toHaveLength(1); // the kept birds come back as a suggested session
  });

  it('deletes only the named birds, and they can be restored', async () => {
    const { o, birds } = await checklistWithBirds(3);
    await deleteOuting(o.id, [birds[0].id, birds[2].id]);
    expect((await db.sightings.get(birds[0].id))!.deleted).toBe(true);
    expect((await db.sightings.get(birds[1].id))!.deleted).toBeFalsy();
    await restoreSighting(birds[0].id);
    const back = (await db.sightings.get(birds[0].id))!;
    expect(back.deleted).toBe(false);
    expect(back.outingId).toBeNull();
  });

  it('ignores birds that belong to another checklist', async () => {
    const a = await checklistWithBirds(1);
    const b = await checklistWithBirds(1);
    await deleteOuting(a.o.id, [b.birds[0].id]);
    expect((await db.sightings.get(b.birds[0].id))!.deleted).toBeFalsy();
    expect((await db.sightings.get(b.birds[0].id))!.outingId).toBe(b.o.id);
    expect((await db.outings.get(b.o.id))!.deleted).toBeFalsy();
  });

  it('turns Birding mode off when the active checklist is deleted', async () => {
    const o = await startOuting();
    await settle();
    await deleteOuting(o.id);
    expect((await getSettings()).activeOutingId).toBeUndefined();
  });

  it('removes an empty draft, and deleting twice changes nothing', async () => {
    const o = await startOuting();
    await stopOuting();
    await settle();
    await deleteOuting(o.id);
    const first = (await db.outings.get(o.id))!;
    await deleteOuting(o.id);
    expect(await db.outings.get(o.id)).toEqual(first);
  });

  it('stores nothing when a write fails part-way', async () => {
    const { o, birds } = await checklistWithBirds(2);
    const before = await db.sightings.toArray();
    vi.spyOn(db.outings, 'put').mockImplementationOnce((() => Promise.reject(new Error('quota'))) as never);
    await expect(deleteOuting(o.id, [birds[0].id])).rejects.toThrow(/quota/);
    expect(await db.sightings.toArray()).toEqual(before);
    expect((await db.outings.get(o.id))!.deleted).toBeFalsy();
  });

  it('deletes exactly the chosen subset, whichever subset that is', async () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 15; round++) {
      await Promise.all(db.tables.map((t) => t.clear()));
      await getSettings();
      const { o, birds } = await checklistWithBirds(5);
      const chosen = birds.filter(() => rand() < 0.5).map((b) => b.id);
      await deleteOuting(o.id, chosen);
      for (const b of birds) expect(!!(await db.sightings.get(b.id))!.deleted).toBe(chosen.includes(b.id));
    }
  });
});
