import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildLines, hasErrors, validateChecklist } from '../src/core/checklist';
import { clean, EBIRD_COLUMNS, outingRows, toCsvFiles } from '../src/core/ebirdCsv';
import { ebirdDate, ebirdTime } from '../src/core/geotime';
import { mergeRecords } from '../src/core/merge';
import { proposeOutings } from '../src/core/outings';
import { touch } from '../src/core/records';
import { buildIndex, mergeLocaleNames, normalize, parseCsv, parseEbirdTaxonomyCsv, searchTaxa } from '../src/core/taxonomy';
import type { Outing, Sighting, Taxon } from '../src/core/types';

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const taxa = parseEbirdTaxonomyCsv(fixture('taxonomy-en.csv'));
mergeLocaleNames(taxa, 'mi', fixture('taxonomy-mi.csv'));
const taxaMap = new Map<string, Taxon>(taxa.map((t) => [t.code, t]));
const index = buildIndex(taxa, ['en', 'mi']);

const NZ = 13 * 60; // NZDT offset in minutes
let n = 0;
function sighting(p: Partial<Sighting> & { at: string }): Sighting {
  const { at, ...rest } = p;
  return {
    id: `s${++n}`,
    createdAt: at,
    updatedAt: at,
    deviceId: 'phoneA',
    observedAt: at,
    tz: 'Pacific/Auckland',
    utcOffsetMin: NZ,
    positionStatus: 'ok',
    countMode: 'exact',
    count: 1,
    detection: 'seen',
    mediaIds: [],
    idHistory: [],
    ...rest
  };
}
function outing(p: Partial<Outing> = {}): Outing {
  return {
    id: 'o1',
    createdAt: '2026-11-20T18:00:00.000Z',
    updatedAt: '2026-11-20T18:00:00.000Z',
    deviceId: 'phoneA',
    origin: 'tapped',
    startedAt: '2026-11-20T18:05:00.000Z', // 07:05 NZDT on 21 Nov
    tz: 'Pacific/Auckland',
    utcOffsetMin: NZ,
    allReported: null,
    countOverrides: {},
    version: 1,
    submission: 'draft',
    ...p
  };
}
const here = (lat: number, lng: number) => ({ lat, lng, at: '2026-11-20T18:05:00.000Z' });

describe('taxonomy', () => {
  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,"b, c","d ""q"""\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "q"'],
      ['1', '2', '3']
    ]);
  });
  it('strips macrons so "tui" finds Tūī', () => {
    expect(normalize('Tūī')).toBe('tui');
    expect(normalize('Pōpokotea')).toBe('popokotea');
  });
  it('splits eBird mi names like "Tūī | Tui"', () => {
    expect(taxaMap.get('tui1')!.names.mi).toEqual(['Tūī']);
    expect(taxaMap.get('whiteh1')!.names.mi).toEqual(['Pōpokotea']);
  });
  it('finds species by 4-letter code, English, Māori and scientific names', () => {
    expect(searchTaxa(index, 'NZFA')[0].taxon.code).toBe('nezfan1');
    expect(searchTaxa(index, 'fantail')[0].taxon.code).toBe('nezfan1');
    expect(searchTaxa(index, 'piwa')[0].taxon.code).toBe('nezfan1');
    expect(searchTaxa(index, 'popo')[0].taxon.code).toBe('whiteh1');
    expect(searchTaxa(index, 'tui')[0].taxon.code).toBe('tui1');
    expect(searchTaxa(index, 'BASW')[0].taxon.code).toBe('barswa');
    expect(searchTaxa(index, 'hirundo')[0].taxon.code).toBe('barswa');
    expect(searchTaxa(index, 'nz fan')[0].taxon.code).toBe('nezfan1');
  });
  it('prefers a name in a chosen language over another species\' 4-letter code', () => {
    // PIWA is Pine Warbler's code; a user with te reo Māori names wants Pīwakawaka.
    const piwa: Taxon = { code: 'pinwar', sci: 'Setophaga pinus', en: 'Pine Warbler', category: 'species', order: 30000, codes: ['PIWA', 'SEPI'], names: {} };
    const hybrid: Taxon = { code: 'x00100', sci: 'Setophaga americana x pinus', en: 'Northern Parula x Pine Warbler (hybrid)', category: 'hybrid', order: 30001, codes: ['NOPA', 'PIWA'], names: {} };
    const withMi = buildIndex([...taxa, piwa, hybrid], ['en', 'mi']);
    expect(searchTaxa(withMi, 'piwa')[0].taxon.code).toBe('nezfan1');
    const enOnly = buildIndex([...taxa, piwa, hybrid], ['en']);
    expect(searchTaxa(enOnly, 'PIWA')[0].taxon.code).toBe('pinwar');
    expect(searchTaxa(enOnly, 'PIWA')[1].taxon.code).toBe('x00100');
  });
});

describe('outing proposals', () => {
  it('splits on gap, distance and date, and explains why', () => {
    const s = [
      sighting({ at: '2026-11-20T18:00:00.000Z', position: here(-36.85, 174.76) }),
      sighting({ at: '2026-11-20T18:20:00.000Z', position: here(-36.851, 174.761) }),
      sighting({ at: '2026-11-20T20:30:00.000Z', position: here(-36.851, 174.761) }), // 130 min gap
      sighting({ at: '2026-11-20T20:40:00.000Z', position: here(-36.9, 174.76) }), // 5.4 km away
      sighting({ at: '2026-11-21T11:30:00.000Z', position: here(-36.9, 174.76) }) // next local day (00:30)
    ];
    const p = proposeOutings(s);
    expect(p.map((x) => x.sightingIds.length)).toEqual([2, 1, 1, 1]);
    expect(p[1].reason).toMatch(/Gap of 130 min/);
    expect(p[2].reason).toMatch(/Moved 5\.\d km/);
    expect(p[3].reason).toMatch(/New calendar date/);
  });
  it('ignores sightings already in an outing', () => {
    expect(proposeOutings([sighting({ at: '2026-11-20T18:00:00.000Z', outingId: 'o1' })])).toEqual([]);
  });
});

describe('checklist lines', () => {
  it('does not add up several entries of one species — they may be the same bird', () => {
    const o = outing();
    const s = [
      sighting({ at: '2026-11-20T18:10:00.000Z', outingId: 'o1', speciesCode: 'tui1', count: 2 }),
      sighting({ at: '2026-11-20T18:20:00.000Z', outingId: 'o1', speciesCode: 'tui1', count: 3 }),
      sighting({ at: '2026-11-20T18:30:00.000Z', outingId: 'o1', speciesCode: 'kea1', countMode: 'present', count: undefined })
    ];
    const lines = buildLines(o, s, taxaMap);
    const tui = lines.find((l) => l.speciesCode === 'tui1')!;
    expect(tui.count).toBe(3);
    expect(tui.countBasis).toBe('largest of several entries');
    expect(lines.find((l) => l.speciesCode === 'kea1')!.count).toBe('X');
    const issues = validateChecklist({ ...o, protocol: 'Incidental' }, s, taxaMap);
    expect(issues.some((i) => i.message.includes('If they were different birds'))).toBe(true);
    // user sets the real total
    expect(buildLines({ ...o, countOverrides: { tui1: 5 } }, s, taxaMap).find((l) => l.speciesCode === 'tui1')!.count).toBe(5);
  });
  it('leaves pending identifications out and says so', () => {
    const o = outing({ protocol: 'Incidental' });
    const s = [
      sighting({ at: '2026-11-20T18:10:00.000Z', outingId: 'o1', speciesCode: 'tui1' }),
      sighting({ at: '2026-11-20T18:11:00.000Z', outingId: 'o1' })
    ];
    expect(buildLines(o, s, taxaMap)).toHaveLength(1);
    expect(validateChecklist(o, s, taxaMap).some((i) => i.message.includes('identification pending'))).toBe(true);
  });
});

describe('checklist validation', () => {
  const one = [sighting({ at: '2026-11-20T18:10:00.000Z', outingId: 'o1', speciesCode: 'tui1', position: here(-36.85, 174.76) })];
  it('requires the completeness answer for non-incidental lists', () => {
    const issues = validateChecklist(outing({ protocol: 'Stationary', durationMin: 30 }), one, taxaMap);
    expect(issues.find((i) => i.field === 'allReported')?.severity).toBe('error');
  });
  it('requires duration and distance for Traveling', () => {
    const issues = validateChecklist(outing({ protocol: 'Traveling', allReported: 'yes' }), one, taxaMap);
    expect(issues.filter((i) => i.severity === 'error').map((i) => i.field)).toEqual(['durationMin', 'distanceKm']);
  });
  it('blocks a checklist that spans two dates', () => {
    const s = [...one, sighting({ at: '2026-11-21T11:30:00.000Z', outingId: 'o1', speciesCode: 'kea1' })];
    const issues = validateChecklist(outing({ protocol: 'Incidental' }), s, taxaMap);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('one calendar date'))).toBe(true);
  });
  it('warns when effort protocols are used on a birding session rebuilt after the fact', () => {
    const issues = validateChecklist(outing({ origin: 'confirmed-proposal', protocol: 'Stationary', durationMin: 20, allReported: 'yes' }), one, taxaMap);
    expect(issues.some((i) => i.message.includes('not recorded with Birding mode'))).toBe(true);
    expect(issues.some((i) => i.message.includes('Mark it complete only if'))).toBe(true);
  });
  it('a valid incidental list has no errors', () => {
    expect(hasErrors(validateChecklist(outing({ protocol: 'Incidental' }), one, taxaMap))).toBe(false);
  });
  it('warns after editing an exported checklist', () => {
    const issues = validateChecklist(outing({ protocol: 'Incidental', submission: 'exported', exportedVersion: 1, version: 2 }), one, taxaMap);
    expect(issues.some((i) => i.message.includes('edited this checklist since you exported'))).toBe(true);
  });
});

describe('eBird Record Format CSV', () => {
  it('uses local date and 24-hour time', () => {
    expect(ebirdDate('2026-11-20T18:05:00.000Z', NZ)).toBe('11/21/2026');
    expect(ebirdTime('2026-11-20T18:05:00.000Z', NZ)).toBe('07:05');
  });
  it('removes quotes, commas and line breaks', () => {
    expect(clean('Big "flock",\nnear hut', 4000)).toBe("Big 'flock'; near hut");
  });
  it('writes 19 columns, no header, miles, Y/N and the Rock Pigeon import name', () => {
    const o = outing({ protocol: 'Traveling', durationMin: 95, distanceKm: 3.2, allReported: 'yes', countryCode: 'NZ', locationName: 'Tāwharanui, North track' });
    const s = [
      sighting({ at: '2026-11-20T18:10:00.000Z', outingId: 'o1', speciesCode: 'tui1', count: 4, note: 'Feeding on flax', position: here(-36.37, 174.83) }),
      sighting({ at: '2026-11-20T18:15:00.000Z', outingId: 'o1', speciesCode: 'rocpig', countMode: 'present', count: undefined, detection: 'heard' })
    ];
    const rows = outingRows(o, s, taxaMap);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.cells).toHaveLength(EBIRD_COLUMNS.length);
    const [pigeon, tui] = [rows.find((r) => r.cells[0].startsWith('Rock'))!.cells, rows.find((r) => r.cells[0] === 'Tui')!.cells];
    expect(pigeon[0]).toBe('Rock Pigeon (Feral Pigeon)');
    expect(pigeon[3]).toBe('X');
    expect(pigeon[4]).toBe('Heard only.');
    expect(tui.slice(1, 4)).toEqual(['Prosthemadera', 'novaeseelandiae', '4']);
    expect(tui[5]).toBe('Tāwharanui; North track');
    expect(tui.slice(8, 17)).toEqual(['11/21/2026', '07:05', '', 'NZ', 'Traveling', '1', '95', 'Y', '1.988']);
    const [file] = toCsvFiles(rows, 'birdtally-test');
    expect(file.text.split('\r\n')[0].startsWith('Common Name')).toBe(false);
    expect(file.text).not.toContain('"');
  });
  it('exports Incidental lists as incomplete with no effort', () => {
    const o = outing({ protocol: 'Incidental', allReported: 'yes', durationMin: 40 });
    const s = [sighting({ at: '2026-11-20T18:10:00.000Z', outingId: 'o1', speciesCode: 'tui1' })];
    const cells = outingRows(o, s, taxaMap)[0].cells;
    expect(cells[14]).toBe('');
    expect(cells[15]).toBe('N');
  });
  it('splits into files under 1 MB without splitting a checklist', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ outingId: `o${i}`, cells: Array(19).fill('x'.repeat(2000)) }));
    const files = toCsvFiles(rows, 'big');
    expect(files.length).toBeGreaterThan(1);
    for (const f of files) expect(f.bytes).toBeLessThanOrEqual(1_000_000);
    expect(files.flatMap((f) => f.outingIds)).toHaveLength(30);
  });
});

describe('merging trip files from two phones', () => {
  const base = sighting({ at: '2026-11-20T18:10:00.000Z', speciesCode: 'tui1' });
  it('fast-forwards when one phone simply has a newer edit', () => {
    const edited = touch(base, { count: 3 }, 'phoneA', '2026-11-20T19:00:00.000Z');
    const r = mergeRecords([base], [edited]);
    expect(r.updated).toBe(1);
    expect(r.conflicts).toHaveLength(0);
    // importing the old file back does nothing
    expect(mergeRecords([edited], [base]).upserts).toHaveLength(0);
  });
  it('keeps both versions when two phones edit the same sighting', () => {
    const onA = touch(base, { count: 3 }, 'phoneA', '2026-11-20T19:00:00.000Z');
    const onB = touch(base, { speciesCode: 'kea1' }, 'phoneB', '2026-11-20T19:05:00.000Z');
    const r = mergeRecords([onA], [onB]);
    expect(r.upserts[0].speciesCode).toBe('kea1');
    expect(r.conflicts).toHaveLength(1);
    expect((r.conflicts[0].other as Sighting).count).toBe(3);
  });
  it('adds new records and carries deletions', () => {
    const del = touch(base, { deleted: true }, 'phoneB', '2026-11-20T19:05:00.000Z');
    const other = sighting({ at: '2026-11-20T18:30:00.000Z', speciesCode: 'kea1', deviceId: 'phoneB' });
    const r = mergeRecords([base], [del, other]);
    expect(r.added).toBe(1);
    expect(r.upserts.find((x) => x.id === base.id)!.deleted).toBe(true);
    expect(r.conflicts).toHaveLength(0);
  });
});
