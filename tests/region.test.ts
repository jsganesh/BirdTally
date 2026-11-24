import { describe, expect, it } from 'vitest';
import { validateChecklist } from '../src/core/checklist';
import { isUnusual, missingRegions, regionSpecies } from '../src/core/region';
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
