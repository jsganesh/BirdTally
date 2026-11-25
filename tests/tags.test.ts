// Entry tags copy the paper notebook marks (P photo, V video, PV phone video, * lifer, ...). Evidence tags reach eBird
// as species-comment phrases; lifer and Check ID stay private.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildLines, validateChecklist } from '../src/core/checklist';
import { stripSighting } from '../src/core/clearing';
import { outingRows } from '../src/core/ebirdCsv';
import { newMeta } from '../src/core/records';
import { tagComments, tagMarks } from '../src/core/tags';
import type { Outing, Sighting, Taxon } from '../src/core/types';
import { validateFile } from '../src/core/validate';
import { db } from '../src/db';
import { addSighting, getSettings, toggleTag } from '../src/store';

const AT = '2026-11-26T01:00:00.000Z';
const taxa = new Map<string, Taxon>([['eurgol', { code: 'eurgol', sci: 'Carduelis carduelis', en: 'European Goldfinch', category: 'species', order: 1, codes: [], names: {} }]]);
const outing: Outing = {
  ...newMeta('d', AT), origin: 'tapped', startedAt: AT, tz: 'Asia/Kolkata', utcOffsetMin: 330, locationName: 'Lake',
  protocol: 'Incidental', allReported: 'no', countOverrides: {}, version: 1, submission: 'draft'
};
const entry = (tags: string[], over: Partial<Sighting> = {}): Sighting => ({
  ...newMeta('d', AT), outingId: outing.id, observedAt: AT, tz: 'Asia/Kolkata', utcOffsetMin: 330, positionStatus: 'unavailable',
  speciesCode: 'eurgol', countMode: 'present', detection: 'seen', mediaIds: [], idHistory: [], tags, ...over
});

describe('tag marks and comments', () => {
  it('shows marks in table order and ignores unknown tags', () => {
    expect(tagMarks(['lifer', 'photo', 'future'])).toBe('P ★');
    expect(tagMarks(undefined)).toBe('');
  });

  it('writes each phrase once, in table order, and never private tags', () => {
    const list = [entry(['male', 'photo', 'lifer']), entry(['phoneVideo', 'photo', 'checkId'])];
    expect(tagComments(list)).toEqual(['Photographed.', 'Video.', 'Male.']);
    const line = buildLines(outing, list, taxa)[0];
    expect(line.comments).toBe('Photographed. Video. Male.');
    expect(outingRows(outing, list, taxa).map((r) => r.cells.join(',')).join('\n')).not.toMatch(/lifer|Check ID|★/i);
  });
});

describe('checklist warnings', () => {
  it('warns about entries marked Check ID', () => {
    const issues = validateChecklist(outing, [entry(['checkId']), entry([])], taxa).map((i) => i.message);
    expect(issues).toContain('1 entry is marked Check ID. Confirm it from your photos before you export.');
  });

  it('counts a photo, video or audio tag as evidence for an unusual bird', () => {
    const warned = (tags: string[]) => validateChecklist(outing, [entry(tags, { unusualHere: true })], taxa).some((i) => i.message.includes('unusual here'));
    expect(warned([])).toBe(true);
    expect(warned(['photo'])).toBe(false);
    expect(warned(['audio'])).toBe(false);
    expect(warned(['lifer'])).toBe(true);
  });
});

describe('storage', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await getSettings();
  });

  it('keeps both of two quick taps, in table order, and a second tap removes', async () => {
    const s = await addSighting({ speciesCode: 'eurgol' });
    await Promise.all([toggleTag(s.id, 'lifer'), toggleTag(s.id, 'photo')]);
    expect((await db.sightings.get(s.id))!.tags).toEqual(['photo', 'lifer']);
    await toggleTag(s.id, 'lifer');
    expect((await db.sightings.get(s.id))!.tags).toEqual(['photo']);
  });

  it('imports a file with a tag from a newer version, and refuses a damaged list', () => {
    const file = (tags: unknown) => ({ format: 'birdtally', formatVersion: 2, kind: 'backup', exportedAt: AT, deviceId: 'd', deviceName: 'x', trips: [], outings: [], sightings: [{ ...entry([]), tags }], media: [], exports: [], conflicts: [] });
    expect(() => validateFile(file(['photo', 'future']))).not.toThrow();
    expect(() => validateFile(file('photo'))).toThrow(/tags/);
  });

  it('drops tags when a deleted entry is cleared', () => {
    expect(stripSighting(entry(['photo'], { deleted: true })).tags).toBeUndefined();
  });
});
