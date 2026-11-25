// The paper day list starts with day, date and place. Testers did not see that BirdTally records time and GPS with
// every entry, because Today never showed it.
import { describe, expect, it } from 'vitest';
import { daySheet, gpsLabel } from '../src/core/day';
import { newMeta } from '../src/core/records';
import type { Outing, Sighting } from '../src/core/types';

const entry = (over: Partial<Sighting> = {}): Sighting => ({
  id: 'a', createdAt: '2026-11-26T01:00:00Z', updatedAt: '2026-11-26T01:00:00Z', deviceId: 'd',
  observedAt: '2026-11-26T01:00:00Z', tz: 'Asia/Kolkata', utcOffsetMin: 330, positionStatus: 'ok',
  countMode: 'present', detection: 'seen', mediaIds: [], idHistory: [], ...over
});

describe('gpsLabel', () => {
  it('says GPS comes with each bird before the first entry', () => {
    expect(gpsLabel(undefined)).toBe('GPS taken with each bird');
  });

  it.each([
    [{ position: { lat: 9.6, lng: 76.4, accuracyM: 8, at: '2026-11-26T01:00:00Z' } }, 'GPS ✓ ±8 m'],
    [{ position: { lat: 9.6, lng: 76.4, at: '2026-11-26T01:00:00Z' } }, 'GPS ✓'],
    [{ positionStatus: 'pending' as const }, 'Getting GPS…'],
    [{ positionStatus: 'denied' as const }, 'No GPS: permission off'],
    [{ positionStatus: 'unavailable' as const }, 'No GPS fix']
  ])('%o → %s', (over, label) => {
    expect(gpsLabel(entry(over))).toBe(label);
  });
});

describe('daySheet', () => {
  const name = (code?: string) => ({ eurgol: 'European Goldfinch', commyn: 'Common Myna' })[code as 'eurgol'] ?? code ?? '';
  const at = (hhmm: string) => `2026-11-26T${hhmm}:00.000Z`; // shown at +05:30
  const outing = (locationName?: string): Outing => ({ ...newMeta('d', at('01:00')), locationName, origin: 'tapped', startedAt: at('01:00'), tz: 'Asia/Kolkata', utcOffsetMin: 330, allReported: null, countOverrides: {}, version: 1, submission: 'draft' });

  it('writes one line per entry, oldest first, repeats kept', () => {
    const o = outing('Kumarakom, Kerala');
    const entries = [
      entry({ id: 'c', observedAt: at('01:40'), outingId: o.id, note: 'perched\non wire' }),
      entry({ id: 'a', observedAt: at('01:12'), outingId: o.id, speciesCode: 'eurgol', tags: ['photo'] }),
      entry({ id: 'b', observedAt: at('01:15'), outingId: o.id, speciesCode: 'eurgol', tags: ['lifer', 'phoneVideo'], countMode: 'exact', count: 3 }),
      entry({ id: 'd', observedAt: at('01:50'), speciesCode: 'commyn', countMode: 'estimate', count: 20 }),
      entry({ id: 'e', observedAt: at('01:55'), speciesCode: 'commyn', deleted: true })
    ];
    expect(daySheet('Thu, 26 Nov 2026', entries, [o], name)).toBe(
      [
        'Thu, 26 Nov 2026 · Kumarakom, Kerala',
        '06:42 European Goldfinch P',
        '06:45 European Goldfinch ×3 PV ★',
        '07:10 Unknown bird (to identify) - perched on wire',
        '07:20 Common Myna ~20'
      ].join('\n')
    );
  });

  it('names the place from GPS when no checklist has a name, else gives the date alone', () => {
    const fix = { lat: 9.617123, lng: 76.430104, at: at('01:00') };
    expect(daySheet('Thu', [entry({ speciesCode: 'eurgol', position: fix })], [], name).split('\n')[0]).toBe('Thu · GPS 9.61712, 76.43010');
    expect(daySheet('Thu', [entry({ speciesCode: 'eurgol', positionStatus: 'denied' })], [outing()], name).split('\n')[0]).toBe('Thu');
  });
});
