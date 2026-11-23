// End-to-end test of the field notebook through the real storage layer (IndexedDB via
// fake-indexeddb). No network is used after the taxonomy download, mirroring offline use.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildLines, hasErrors, validateChecklist } from '../src/core/checklist';
import { outingRows, toCsvFiles } from '../src/core/ebirdCsv';
import { proposeOutings } from '../src/core/outings';
import { touch } from '../src/core/records';
import type { Sighting, Taxon } from '../src/core/types';
import { db } from '../src/db';
import {
  addMedia,
  addSighting,
  buildBackup,
  confirmProposal,
  downloadTaxonomy,
  getSettings,
  importFile,
  startOuting,
  stopOuting,
  updateOuting,
  updateSighting
} from '../src/store';

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
let taxa: Map<string, Taxon>;

/** Move the clock to a local NZ time (NZDT = UTC+13) on 21 Nov 2026. */
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 20, h - 13 + 24, m)));
};

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  process.env.TZ = 'Pacific/Auckland';
  vi.stubGlobal('fetch', async (url: string) => {
    const u = String(url);
    const body = u.includes('/versions')
      ? JSON.stringify([{ authorityVer: 2026, latest: true }])
      : u.includes('locale=mi')
        ? fixture('taxonomy-mi.csv')
        : fixture('taxonomy-en.csv');
    return new Response(body, { status: 200 });
  });
  await getSettings();
  const log: string[] = [];
  await downloadTaxonomy(['mi'], (m) => log.push(m));
  const t = await db.taxonomy.get('current');
  taxa = new Map(t!.taxa.map((x) => [x.code, x]));
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline'); // everything after this point must work without a network
  });
});
afterAll(() => vi.useRealTimers());

const settle = () => new Promise((r) => setTimeout(r, 20)); // let the GPS callback finish

describe('a morning of birding, recorded offline', () => {
  let outingId: string;

  it('stores the taxonomy version and Māori names for offline search', async () => {
    const t = await db.taxonomy.get('current');
    expect(t!.version).toBe(2026);
    expect(t!.locales).toEqual(['en', 'mi']);
    expect(taxa.get('tui1')!.names.mi).toEqual(['Tūī']);
  });

  it('records a tapped outing with birds, a voice note and a pending ID', async () => {
    at('07:00');
    const o = await startOuting();
    outingId = o.id;
    at('07:05');
    await addSighting({ speciesCode: 'tui1' });
    at('07:12');
    await addSighting({ speciesCode: 'nezfan1', countMode: 'exact', count: 1 });
    at('07:40');
    await addSighting({ speciesCode: 'nezfan1', countMode: 'exact', count: 2, note: 'pair near the stream' });
    at('07:50');
    const voice = await addSighting({});
    await addMedia(voice.id, new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }), 'audio', 4);
    at('08:10');
    await stopOuting();
    await settle();

    const all = await db.sightings.where('outingId').equals(o.id).toArray();
    expect(all).toHaveLength(4);
    expect(all.every((s) => s.positionStatus !== 'pending')).toBe(true); // no GPS in tests → 'unavailable'
    const out = await db.outings.get(o.id);
    expect(out!.durationMin).toBe(70);
    expect((await getSettings()).activeOutingId).toBeUndefined();
    expect((await db.media.toArray())[0].kind).toBe('audio');
  });

  it('identifies the voice-note bird later and keeps the history', async () => {
    const pending = (await db.sightings.toArray()).find((s) => !s.speciesCode)!;
    await updateSighting(pending.id, { speciesCode: 'whiteh1', merlinSuggestion: 'Whitehead (Sound ID)' });
    const s = await db.sightings.get(pending.id);
    expect(s!.speciesCode).toBe('whiteh1');
    expect(s!.idHistory.at(-1)!.speciesCode).toBe('whiteh1');
    expect(s!.history!.length).toBeGreaterThan(0);
  });

  it('two quick edits do not overwrite each other', async () => {
    await Promise.all([updateOuting(outingId, { countryCode: 'NZ' }), updateOuting(outingId, { protocol: 'Stationary' }), updateOuting(outingId, { locationName: 'Tāwharanui, North Track' })]);
    const o = await db.outings.get(outingId);
    expect(o).toMatchObject({ countryCode: 'NZ', protocol: 'Stationary', locationName: 'Tāwharanui, North Track' });
  });

  it('suggests outings for birds logged without tapping Start, split by gap', async () => {
    at('11:00');
    await addSighting({ speciesCode: 'kea1' });
    at('11:20');
    await addSighting({ speciesCode: 'tui1', countMode: 'estimate', count: 6 });
    at('14:30');
    await addSighting({ speciesCode: 'kea1', detection: 'heard' });
    await settle();
    const proposals = proposeOutings(await db.sightings.toArray());
    expect(proposals.map((p) => p.sightingIds.length)).toEqual([2, 1]);
    expect(proposals[1].reason).toMatch(/Gap of 190 min/);
    const o = await confirmProposal(proposals[0]);
    expect(o.protocol).toBe('Incidental');
    expect(o.durationMin).toBeUndefined(); // never invented from entry times
  });

  it('review: completeness must be answered and duplicate entries are not summed', async () => {
    let o = (await db.outings.get(outingId))!;
    const sightings = await db.sightings.toArray();
    let issues = validateChecklist(o, sightings, taxa);
    expect(issues.find((i) => i.field === 'allReported')?.severity).toBe('error');
    expect(issues.some((i) => i.message.startsWith('New Zealand Fantail: 2 entries'))).toBe(true);

    await updateOuting(outingId, { allReported: 'yes', countOverrides: { nezfan1: 3 } }); // they were different birds
    o = (await db.outings.get(outingId))!;
    issues = validateChecklist(o, sightings, taxa);
    expect(hasErrors(issues)).toBe(false);
    const fantail = buildLines(o, sightings, taxa).find((l) => l.speciesCode === 'nezfan1')!;
    expect(fantail.count).toBe(3);
    expect(fantail.countBasis).toBe('your override');
  });

  it('exports the eBird Record Format file and tracks submission', async () => {
    await updateOuting(outingId, { submission: 'ready' }, false);
    const o = (await db.outings.get(outingId))!;
    const sightings = await db.sightings.toArray();
    const [file] = toCsvFiles(outingRows(o, sightings, taxa), 'test');
    const lines = file.text.trim().split('\r\n');
    expect(lines).toEqual([
      'Tui,Prosthemadera,novaeseelandiae,X,,Tāwharanui; North Track,,,11/21/2026,07:00,,NZ,Stationary,1,70,Y,,,',
      'Whitehead,Mohoua,albicilla,X,,Tāwharanui; North Track,,,11/21/2026,07:00,,NZ,Stationary,1,70,Y,,,',
      'New Zealand Fantail,Rhipidura,fuliginosa,3,pair near the stream,Tāwharanui; North Track,,,11/21/2026,07:00,,NZ,Stationary,1,70,Y,,,'
    ]);
    await updateOuting(outingId, { submission: 'exported', exportedVersion: o.version }, false);
    // the user later edits the checklist: the app warns the exported file differs
    const tui = sightings.find((s) => s.outingId === outingId && s.speciesCode === 'tui1')!;
    await updateSighting(tui.id, { countMode: 'exact', count: 2 });
    const after = (await db.outings.get(outingId))!;
    expect(validateChecklist(after, await db.sightings.toArray(), taxa).some((i) => i.message.includes('since you exported'))).toBe(true);
    await updateOuting(outingId, { submission: 'submitted', ebirdChecklistId: 'S123456789' }, false);
    expect((await db.outings.get(outingId))!.submission).toBe('submitted');
  });
});

describe('two phones on one trip', () => {
  it('merges a trip file from the other phone, keeping both versions of a clash', async () => {
    const mine = await buildBackup('trip');
    // Phone B started from the same data, then: edited one sighting and logged a new bird.
    const shared = mine.sightings.find((s) => s.speciesCode === 'kea1')!;
    const editedOnB = touch(shared, { countMode: 'exact', count: 2 } as Partial<Sighting>, 'phoneB', '2026-11-21T02:00:00.000Z');
    const newOnB: Sighting = { ...shared, id: 'phoneB-1', deviceId: 'phoneB', speciesCode: 'tui1', history: [], observedAt: '2026-11-21T01:30:00.000Z' };
    // Meanwhile this phone also edited the same sighting.
    await updateSighting(shared.id, { note: 'on the hut roof' });

    const fileFromB = { ...mine, deviceId: 'phoneB', deviceName: 'Android', sightings: [editedOnB, newOnB], outings: [], trips: [], media: [], exports: [] };
    const r = await importFile(JSON.stringify(fileFromB));
    expect(r.added).toBe(1);
    expect(r.conflicts).toBe(1);
    const c = (await db.conflicts.toArray())[0];
    expect(c.recordId).toBe(shared.id);
    // importing the same file again changes nothing, and does not repeat the clash
    const again = await importFile(JSON.stringify(fileFromB));
    expect(again.added + again.updated + again.conflicts).toBe(0);
    expect(await db.conflicts.count()).toBe(1);
  });

  it('a backup restores voice notes byte for byte', async () => {
    const b = await buildBackup('backup');
    expect(b.media).toHaveLength(1);
    expect(Buffer.from(b.media[0].dataBase64, 'base64')).toEqual(Buffer.from([1, 2, 3]));
    expect(b.format).toBe('birdtally');
  });
});
