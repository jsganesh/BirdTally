// A trip file carries one trip, so sending it to a companion does not share the whole notebook.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { addMedia, addSighting, buildBackup, createTrip, getSettings, importFile, startOuting, stopOuting, updateSettings } from '../src/store';

const settle = () => new Promise((r) => setTimeout(r, 30));

async function twoTrips() {
  const borneo = await createTrip('Borneo 2027', ['MY']);
  await startOuting();
  const onBorneo = await addSighting({ speciesCode: 'tui1' });
  await addMedia(onBorneo.id, new Blob([new Uint8Array([1, 2, 3])]), 'audio', 2);
  await stopOuting();
  const home = await createTrip('Home', ['NZ']);
  const onHome = await addSighting({ speciesCode: 'kea1' });
  await settle();
  return { borneo, home, onBorneo, onHome };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await getSettings();
});

describe('buildBackup', () => {
  it('a trip file holds only that trip, with its media and birding sessions', async () => {
    const { borneo, onBorneo } = await twoTrips();
    const f = await buildBackup('trip', borneo.id);
    expect(f.kind).toBe('trip');
    expect(f.trips.map((t) => t.id)).toEqual([borneo.id]);
    expect(f.sightings.map((s) => s.id)).toEqual([onBorneo.id]);
    expect(f.outings).toHaveLength(1);
    expect(f.media).toHaveLength(1);
    expect(f.exports).toEqual([]);
  });

  it('defaults to the active trip', async () => {
    const { home, onHome } = await twoTrips();
    const f = await buildBackup('trip');
    expect(f.trips.map((t) => t.id)).toEqual([home.id]);
    expect(f.sightings.map((s) => s.id)).toEqual([onHome.id]);
  });

  it('refuses a trip file when there is no trip, rather than exporting everything', async () => {
    await twoTrips();
    await updateSettings({ activeTripId: undefined });
    await expect(buildBackup('trip')).rejects.toThrow(/Choose a trip/);
  });

  it('a backup still holds everything', async () => {
    await twoTrips();
    const f = await buildBackup('backup');
    expect(f.trips).toHaveLength(2);
    expect(f.sightings).toHaveLength(2);
  });

  it('a trip file imports on another device', async () => {
    const { borneo, onBorneo } = await twoTrips();
    const text = JSON.stringify(await buildBackup('trip', borneo.id));
    await Promise.all(db.tables.map((t) => t.clear()));
    await getSettings();
    const r = await importFile(text);
    expect(r.added).toBeGreaterThan(0);
    expect((await db.sightings.get(onBorneo.id))!.speciesCode).toBe('tui1');
    expect(await db.sightings.count()).toBe(1);
  });
});
