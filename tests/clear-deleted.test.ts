// Clearing deleted entries frees their photos and details for good, but must never let an old
// copy (another phone, an older backup) bring them back.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearable } from '../src/core/clearing';
import type { Sighting } from '../src/core/types';
import { validateFile } from '../src/core/validate';
import { db } from '../src/db';
import { addMedia, addSighting, buildBackup, clearDeleted, deleteSighting, getSettings, importFile, restoreSighting } from '../src/store';

const settle = () => new Promise((r) => setTimeout(r, 30));
const DAY = 86_400_000;

async function deletedBirdWithPhoto() {
  const s = await addSighting({ speciesCode: 'kea1', note: 'on the hut roof' });
  await settle();
  await addMedia(s.id, new Blob([new Uint8Array(2000)], { type: 'image/jpeg' }), 'photo');
  await deleteSighting(s.id);
  return s;
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await getSettings();
});
afterEach(() => vi.restoreAllMocks());

describe('clearDeleted', () => {
  it('removes the details, position and photo file of a deleted entry, and reports what it freed', async () => {
    const s = await deletedBirdWithPhoto();
    expect(await clearDeleted()).toEqual({ entries: 1, bytes: 2000 });
    const row = (await db.sightings.get(s.id))!;
    expect(row).toMatchObject({ deleted: true, cleared: true, outingId: null, mediaIds: [], idHistory: [] });
    expect(row.speciesCode).toBeUndefined();
    expect(row.note).toBeUndefined();
    expect(row.position).toBeUndefined();
    expect(await db.mediaBlobs.count()).toBe(0);
    expect(await db.media.count()).toBe(1); // the small row stays, so a file that lists it cannot add the file back
  });

  it('leaves live entries alone', async () => {
    const live = await addSighting({ speciesCode: 'tui1' });
    await deletedBirdWithPhoto();
    await clearDeleted();
    expect((await db.sightings.get(live.id))!.speciesCode).toBe('tui1');
  });

  it('with a minimum age, clears only entries deleted that long ago', async () => {
    const old = await deletedBirdWithPhoto();
    const recent = await deletedBirdWithPhoto();
    await db.sightings.update(old.id, { updatedAt: new Date(Date.now() - 40 * DAY).toISOString() });
    expect((await clearDeleted(30)).entries).toBe(1);
    expect((await db.sightings.get(old.id))!.cleared).toBe(true);
    expect((await db.sightings.get(recent.id))!.cleared).toBeUndefined();
    expect((await db.sightings.get(recent.id))!.speciesCode).toBe('kea1');
  });

  it('a second run clears nothing and does not touch the record again', async () => {
    const s = await deletedBirdWithPhoto();
    await clearDeleted();
    const first = await db.sightings.get(s.id);
    expect(await clearDeleted()).toEqual({ entries: 0, bytes: 0 });
    expect(await db.sightings.get(s.id)).toEqual(first);
  });

  it('stores nothing when a write fails part-way', async () => {
    const s = await deletedBirdWithPhoto();
    vi.spyOn(db.sightings, 'bulkPut').mockRejectedValueOnce(new Error('quota'));
    await expect(clearDeleted()).rejects.toThrow(/quota/);
    expect((await db.sightings.get(s.id))!.speciesCode).toBe('kea1');
    expect(await db.mediaBlobs.count()).toBe(1);
  });

  it('an older copy of the entry, from another phone or backup, does not bring it back', async () => {
    const s = await addSighting({ speciesCode: 'kea1' });
    await settle();
    await addMedia(s.id, new Blob([new Uint8Array(2000)], { type: 'image/jpeg' }), 'photo');
    const oldBackup = JSON.stringify(await buildBackup('backup')); // still live, with its photo
    await deleteSighting(s.id);
    await clearDeleted();
    const r = await importFile(oldBackup);
    expect(r.conflicts).toBe(0);
    const row = (await db.sightings.get(s.id))!;
    expect(row).toMatchObject({ deleted: true, cleared: true });
    expect(row.speciesCode).toBeUndefined();
    expect(await db.mediaBlobs.count()).toBe(0);
  });

  it('a cleared entry survives a backup and restore on another device as a blank deleted mark', async () => {
    const s = await deletedBirdWithPhoto();
    await clearDeleted();
    const file = JSON.stringify(await buildBackup('backup'));
    expect(() => validateFile(JSON.parse(file))).not.toThrow();
    expect(JSON.parse(file).media).toEqual([]); // no file to send
    await Promise.all(db.tables.map((t) => t.clear()));
    await getSettings();
    await importFile(file);
    expect((await db.sightings.get(s.id))!).toMatchObject({ deleted: true, cleared: true });
  });
});

describe('clearable', () => {
  const base = { updatedAt: new Date(10 * DAY).toISOString() } as Sighting;
  it('needs a deleted entry that still has its details', () => {
    expect(clearable({ ...base, deleted: true }, 10 * DAY, 0)).toBe(true);
    expect(clearable({ ...base }, 10 * DAY, 0)).toBe(false);
    expect(clearable({ ...base, deleted: true, cleared: true }, 10 * DAY, 0)).toBe(false);
  });
  it('respects the minimum age, including its boundary', () => {
    expect(clearable({ ...base, deleted: true }, 39 * DAY, 30)).toBe(false);
    expect(clearable({ ...base, deleted: true }, 40 * DAY, 30)).toBe(true);
  });
  it('an entry stamped slightly ahead of the clock still counts as zero days old', () => {
    expect(clearable({ ...base, deleted: true }, 10 * DAY - 1, 0)).toBe(true);
    expect(clearable({ ...base, deleted: true }, 10 * DAY - 1, 1)).toBe(false);
  });
  it('a restored entry is no longer deleted, so is never cleared', async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await getSettings();
    const s = await deletedBirdWithPhoto();
    await restoreSighting(s.id);
    expect((await clearDeleted()).entries).toBe(0);
  });
});
