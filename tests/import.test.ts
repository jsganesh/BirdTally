// Importing BirdTally files through the real storage layer (fake-indexeddb).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { newMeta } from '../src/core/records';
import type { Sighting } from '../src/core/types';
import { validateFile } from '../src/core/validate';
import { db } from '../src/db';
import { buildBackup, getSettings, importFile } from '../src/store';

function sighting(id: string, over: Partial<Sighting> = {}): Sighting {
  return {
    ...newMeta('phoneB', '2026-11-20T18:10:00.000Z'),
    id,
    outingId: null,
    observedAt: '2026-11-20T18:10:00.000Z',
    tz: 'Pacific/Auckland',
    utcOffsetMin: 780,
    positionStatus: 'ok',
    speciesCode: 'tui1',
    countMode: 'present',
    detection: 'seen',
    mediaIds: [],
    idHistory: [],
    ...over
  };
}
const file = (over: Record<string, unknown> = {}) => ({
  format: 'birdtally',
  formatVersion: 1,
  kind: 'backup',
  exportedAt: '2026-11-21T00:00:00.000Z',
  deviceId: 'phoneB',
  deviceName: 'Android',
  trips: [],
  outings: [],
  sightings: [sighting('s1')],
  media: [],
  exports: [],
  ...over
});
const photo = (over: Record<string, unknown> = {}) => ({
  ...newMeta('phoneB', '2026-11-20T18:10:00.000Z'),
  id: 'm1',
  sightingId: 's1',
  kind: 'photo',
  mime: 'image/jpeg',
  bytes: 3,
  capturedAt: '2026-11-20T18:10:00.000Z',
  dataBase64: 'AQID',
  ...over
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await getSettings();
});

describe('importing a file checks every record first', () => {
  const refused: [string, Record<string, unknown>, RegExp][] = [
    ['a sighting without its media list', { sightings: [{ ...sighting('s1'), mediaIds: undefined }] }, /Sighting 1 .*"mediaIds"/],
    ['an edit history that is not a list of times', { sightings: [{ ...sighting('s1'), history: 'xx2026-11-20T18:10:00.000Z' }] }, /"history"/],
    ['an unknown count mode', { sightings: [sighting('s1', { countMode: 'lots' as never })] }, /"countMode"/],
    ['coordinates off the globe', { sightings: [sighting('s1', { position: { lat: 91, lng: 0, at: '2026-11-20T18:10:00.000Z' } })] }, /"position"/],
    ['the same id twice', { sightings: [sighting('s1', { note: 'a' }), sighting('s1', { note: 'b' })] }, /repeats id s1/],
    ['media that is not a photo or sound', { media: [photo({ mime: 'text/html' })] }, /Media item 1 .*"mime"/],
    ['media that is not base64', { media: [photo({ dataBase64: '<script>' })] }, /"dataBase64"/],
    ['media for a sighting that is not in the file', { media: [photo({ sightingId: 'elsewhere' })] }, /not in the file/],
    ['a missing list', { exports: undefined }, /"exports" is missing/],
    ['a newer format', { formatVersion: 99 }, /newer version/]
  ];
  it.each(refused)('refuses %s and stores nothing', async (_, over, message) => {
    await expect(importFile(JSON.stringify(file(over)))).rejects.toThrow(message);
    expect(await db.sightings.count()).toBe(0);
    expect(await db.media.count()).toBe(0);
  });

  it('refuses text that is not JSON with a plain message', async () => {
    await expect(importFile('{"format": "birdtally",')).rejects.toThrow(/not valid JSON/);
  });

  it('accepts a voice note recorded as audio/webm;codecs=opus', () => {
    expect(() => validateFile(file({ media: [photo({ kind: 'audio', mime: 'audio/webm;codecs=opus' })] }))).not.toThrow();
  });

  it('accepts the files BirdTally itself writes', async () => {
    await importFile(JSON.stringify(file({ media: [photo()] })));
    const backup = await buildBackup('backup');
    expect(() => validateFile(JSON.parse(JSON.stringify(backup)))).not.toThrow();
  });
});
