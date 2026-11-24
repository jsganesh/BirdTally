import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { addSighting, getSettings, settleStalePositions } from '../src/store';

const settle = () => new Promise((r) => setTimeout(r, 30));

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await getSettings();
});

describe('settleStalePositions', () => {
  it('ends "Getting GPS…" for an entry whose fix never arrived, and leaves a fresh one pending', async () => {
    const old = await addSighting({ speciesCode: 'tui1' });
    const fresh = await addSighting({ speciesCode: 'kea1' });
    await settle();
    await db.sightings.update(old.id, { positionStatus: 'pending' });
    await db.sightings.update(fresh.id, { positionStatus: 'pending' });
    await db.sightings.update(old.id, { createdAt: new Date(Date.now() - 10 * 60_000).toISOString() });
    await settleStalePositions();
    expect((await db.sightings.get(old.id))!.positionStatus).toBe('unavailable');
    expect((await db.sightings.get(fresh.id))!.positionStatus).toBe('pending');
  });

  it('does not touch entries that already have a result', async () => {
    const s = await addSighting({ speciesCode: 'tui1' });
    await settle();
    const before = await db.sightings.get(s.id);
    await settleStalePositions(Date.now() + 3_600_000);
    expect(await db.sightings.get(s.id)).toEqual(before);
  });
});
