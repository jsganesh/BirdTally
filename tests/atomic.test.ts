// Each user action is one transaction: if any part of it fails (a full disk, a crash), none of it
// is stored. Checked by making one write fail part-way through each multi-step action.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { addSighting, createTrip, getSettings, mergeOutings, splitOutingAt, startOuting } from '../src/store';

const reject = () => Promise.reject(Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' }));
const quotaFull = reject as never;
/** Let the first `okCalls` calls through, then fail: reaches the last step of an action. */
const failAfter = (okCalls: number, real: (...a: never[]) => unknown) => {
  let n = 0;
  return ((...a: never[]) => (n++ < okCalls ? real(...a) : reject())) as never;
};
const settle = () => new Promise((r) => setTimeout(r, 20)); // let background GPS fill-ins finish first

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await getSettings();
});
afterEach(() => vi.restoreAllMocks());

describe('a failed write leaves nothing half-done', () => {
  it('adding a bird during Birding mode', async () => {
    const o = await startOuting();
    await settle();
    vi.spyOn(db.outings, 'put').mockImplementationOnce(quotaFull);
    await expect(addSighting({ speciesCode: 'tui1' })).rejects.toThrow(/quota/);
    expect(await db.sightings.count()).toBe(0);
    expect((await getSettings()).entriesSinceBackup).toBe(0);
    expect((await db.outings.get(o.id))!.version).toBe(1);
  });

  it('turning Birding mode on', async () => {
    vi.spyOn(db.settings, 'update').mockImplementationOnce(quotaFull);
    await expect(startOuting()).rejects.toThrow(/quota/);
    expect(await db.outings.count()).toBe(0);
  });

  it('creating a trip', async () => {
    vi.spyOn(db.settings, 'update').mockImplementationOnce(quotaFull);
    await expect(createTrip('Borneo 2027', ['MY'])).rejects.toThrow(/quota/);
    expect(await db.trips.count()).toBe(0);
  });

  it('splitting a birding session', async () => {
    const o = await startOuting();
    await addSighting({ speciesCode: 'tui1' });
    const later = await addSighting({ speciesCode: 'kea1' });
    await settle();
    const outingsBefore = await db.outings.toArray();
    // The new session and the moved entry are written, then re-editing the original fails.
    const put = db.outings.put.bind(db.outings);
    vi.spyOn(db.outings, 'put').mockImplementation(failAfter(1, put));
    await expect(splitOutingAt(o.id, later.id)).rejects.toThrow(/quota/);
    expect(await db.outings.toArray()).toEqual(outingsBefore);
    expect((await db.sightings.get(later.id))!.outingId).toBe(o.id);
  });

  it('merging two birding sessions', async () => {
    const a = await startOuting();
    const b = await startOuting();
    const s = await addSighting({ speciesCode: 'tui1' }); // goes to b, the active one
    await settle();
    // The entries move and b is deleted, then the new version of a fails.
    const put = db.outings.put.bind(db.outings);
    vi.spyOn(db.outings, 'put').mockImplementation(failAfter(1, put));
    await expect(mergeOutings(a.id, b.id)).rejects.toThrow(/quota/);
    expect((await db.sightings.get(s.id))!.outingId).toBe(b.id);
    expect((await db.outings.get(b.id))!.deleted).toBeFalsy();
  });
});
