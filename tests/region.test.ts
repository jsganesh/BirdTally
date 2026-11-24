import { describe, expect, it } from 'vitest';
import { validateChecklist } from '../src/core/checklist';
import { addRegionCode, insideBounds, isUnusual, missingRegions, outsideRegions, regionSpecies, regionsToFetch } from '../src/core/region';
import type { Outing, Sighting, Taxon } from '../src/core/types';
import { validateFile } from '../src/core/validate';

const taxon = (code: string, category = 'species', reportAs?: string): Taxon => ({ code, sci: code, en: code, category, order: 1, codes: [], names: {}, reportAs });
const lists = new Map([['NZ-AUK', ['tui1', 'nezfan1']], ['NZ-WKO', ['kea1']]]);

describe('regionSpecies', () => {
  it('merges the lists of every region on the trip', () => {
    expect([...regionSpecies(['NZ-AUK', 'NZ-WKO'], lists)!].sort()).toEqual(['kea1', 'nezfan1', 'tui1']);
  });
  it('is off while any region has no list, or the trip has no region', () => {
    expect(regionSpecies(['NZ-AUK', 'NZ-OTA'], lists)).toBeUndefined();
    expect(regionSpecies([], lists)).toBeUndefined();
  });
});

describe('isUnusual', () => {
  const here = regionSpecies(['NZ-AUK'], lists);
  it('flags a species that is on no list', () => expect(isUnusual(taxon('kea1'), here)).toBe(true));
  it('passes a listed species', () => expect(isUnusual(taxon('tui1'), here)).toBe(false));
  it('judges a subspecies or form by its species', () => {
    expect(isUnusual(taxon('nezfan6', 'issf', 'nezfan1'), here)).toBe(false);
    expect(isUnusual(taxon('kea2', 'issf', 'kea1'), here)).toBe(true);
  });
  it.each(['slash', 'spuh', 'hybrid', 'domestic', 'intergrade'])('never flags a %s', (category) => {
    expect(isUnusual(taxon('x00001', category), here)).toBe(false);
  });
  it('never flags anything without lists, or an unknown bird', () => {
    expect(isUnusual(taxon('kea1'), undefined)).toBe(false);
    expect(isUnusual(undefined, here)).toBe(false);
  });
});

describe('review nudge for unusual birds', () => {
  const taxa = new Map([['kea1', taxon('kea1')]]);
  const outing = { id: 'o1', origin: 'tapped', startedAt: '2026-11-21T07:00:00.000Z', tz: 'Pacific/Auckland', utcOffsetMin: 780, allReported: 'no', countOverrides: {}, version: 1, submission: 'draft', protocol: 'Incidental' } as unknown as Outing;
  const sighting = (extra: Partial<Sighting>) =>
    ({ id: 's1', outingId: 'o1', observedAt: '2026-11-21T07:00:00.000Z', tz: 'Pacific/Auckland', utcOffsetMin: 780, speciesCode: 'kea1', countMode: 'present', detection: 'seen', mediaIds: [], idHistory: [], positionStatus: 'ok', position: { lat: -36.8, lng: 174.7 }, unusualHere: true, ...extra }) as unknown as Sighting;
  const nudges = (s: Sighting[]) => validateChecklist(outing, s, taxa).filter((i) => i.message.includes('unusual here'));

  it('warns when nothing backs the entry up', () => expect(nudges([sighting({})])).toHaveLength(1));
  it('is satisfied by a note or by media', () => {
    expect(nudges([sighting({ note: 'orange underwings, calling' })])).toHaveLength(0);
    expect(nudges([sighting({ mediaIds: ['m1'] })])).toHaveLength(0);
  });
  it('stays quiet for birds not marked unusual', () => expect(nudges([sighting({ unusualHere: undefined })])).toHaveLength(0));
});

describe('file validation', () => {
  it('accepts unusualHere only as a boolean', () => {
    const file = (v: unknown) => ({ format: 'birdtally', formatVersion: 2, kind: 'backup', exportedAt: '2026-11-21T00:00:00.000Z', deviceId: 'd', deviceName: 'n', trips: [], outings: [], media: [], exports: [], conflicts: [], sightings: [{ id: 's1', createdAt: '2026-11-21T00:00:00.000Z', updatedAt: '2026-11-21T00:00:00.000Z', deviceId: 'd', observedAt: '2026-11-21T00:00:00.000Z', tz: 'UTC', utcOffsetMin: 0, positionStatus: 'ok', countMode: 'present', detection: 'seen', mediaIds: [], idHistory: [], unusualHere: v }] });
    expect(() => validateFile(file(true))).not.toThrow();
    expect(() => validateFile(file('yes'))).toThrow(/unusualHere/);
  });
});

describe('missingRegions', () => {
  it('lists only the regions with no list', () => {
    expect(missingRegions(['NZ-AUK', 'NZ-WKO'], ['NZ-AUK'])).toEqual(['NZ-WKO']);
    expect(missingRegions(['NZ-AUK'], ['NZ-AUK', 'AU'])).toEqual([]);
    expect(missingRegions([], [])).toEqual([]);
  });
});

describe('GPS cross-check geometry', () => {
  const auckland = { minX: 174.3, maxX: 175.4, minY: -37.3, maxY: -36.1 };
  const wellington = { minX: 174.6, maxX: 175.5, minY: -41.4, maxY: -40.8 };
  const chatham = { minX: 172, maxX: -175, minY: -45, maxY: -34 }; // crosses the antimeridian

  it('inside, outside and the margin around a box', () => {
    expect(insideBounds({ lat: -36.85, lng: 174.76 }, auckland)).toBe(true);
    expect(insideBounds({ lat: -36.0, lng: 174.8 }, auckland)).toBe(true); // 0.1 degree north: within the margin
    expect(insideBounds({ lat: -41.29, lng: 174.78 }, auckland)).toBe(false);
    expect(insideBounds({ lat: 51.5, lng: -0.12 }, auckland)).toBe(false);
  });

  it('handles a box that crosses the antimeridian', () => {
    expect(insideBounds({ lat: -43.9, lng: -176.5 }, chatham)).toBe(true);
    expect(insideBounds({ lat: -40, lng: 173 }, chatham)).toBe(true);
    expect(insideBounds({ lat: -40, lng: 0 }, chatham)).toBe(false);
  });

  it('is outside only when every region has a box and none contains the point', () => {
    const wgtn = { lat: -41.29, lng: 174.78 };
    expect(outsideRegions(wgtn, [auckland])).toBe(true);
    expect(outsideRegions(wgtn, [auckland, wellington])).toBe(false);
    expect(outsideRegions(wgtn, [auckland, null])).toBe(false); // a region with no box: cannot know
    expect(outsideRegions(wgtn, [auckland, undefined])).toBe(false);
    expect(outsideRegions(wgtn, [])).toBe(false);
  });

  it('regionsToFetch asks for missing lists and for lists saved before boxes existed', () => {
    const records = [{ key: 'NZ-AUK', bounds: auckland }, { key: 'NZ-WKO' }, { key: 'NZ-OTA', bounds: null }];
    expect(regionsToFetch(['NZ-AUK', 'NZ-WKO', 'NZ-OTA', 'NZ-NSN'], records)).toEqual(['NZ-WKO', 'NZ-NSN']);
  });
});

describe('addRegionCode', () => {
  it('appends in upper case', () => expect(addRegionCode('NZ', 'nz-auk')).toBe('NZ,NZ-AUK'));
  it('starts a list', () => expect(addRegionCode('', 'NZ')).toBe('NZ'));
  it('does not repeat a code, and tidies what was typed', () => expect(addRegionCode('nz , nz-auk', 'NZ-AUK')).toBe('NZ,NZ-AUK'));
  it('ignores an empty code', () => expect(addRegionCode('NZ', ' ')).toBe('NZ'));
});
