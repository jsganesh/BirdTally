import { describe, expect, it } from 'vitest';
import { mergeRecords } from '../src/core/merge';
import { newMeta, touch } from '../src/core/records';
import type { Sighting } from '../src/core/types';

const base: Sighting = {
  ...newMeta('phoneA', '2026-11-20T18:10:00.000Z'),
  outingId: null,
  observedAt: '2026-11-20T18:10:00.000Z',
  tz: 'Pacific/Auckland',
  utcOffsetMin: 780,
  positionStatus: 'ok',
  speciesCode: 'tui1',
  countMode: 'present',
  detection: 'seen',
  mediaIds: [],
  idHistory: []
};
const at = (hh: number) => `2026-11-20T${String(hh).padStart(2, '0')}:00:00.000Z`;

describe('a delete on one phone and an edit on the other', () => {
  const edited = touch(base, { note: 'pair on the hut roof' }, 'phoneA', at(19));

  it('keeps the edit for review when the delete came later', () => {
    const deleted = touch(base, { deleted: true }, 'phoneB', at(20));
    const r = mergeRecords([edited], [deleted]);
    expect(r.upserts[0].deleted).toBe(true);
    expect(r.conflicts).toEqual([{ kept: deleted, other: edited }]);
  });

  it('keeps the delete for review when the edit came later', () => {
    const deleted = touch(base, { deleted: true }, 'phoneB', at(18));
    const r = mergeRecords([deleted], [edited]);
    expect(r.upserts[0].note).toBe('pair on the hut roof');
    expect(r.conflicts).toEqual([{ kept: edited, other: deleted }]);
  });

  it('is not a clash when both phones deleted it', () => {
    const a = touch(base, { deleted: true }, 'phoneA', at(19));
    const b = touch(base, { deleted: true }, 'phoneB', at(20));
    expect(mergeRecords([a], [b]).conflicts).toHaveLength(0);
  });

  it('is not a clash when the delete was made on top of the edit', () => {
    const deletedAfterSeeingEdit = touch(edited, { deleted: true }, 'phoneB', at(20));
    const r = mergeRecords([edited], [deletedAfterSeeingEdit]);
    expect(r.updated).toBe(1);
    expect(r.conflicts).toHaveLength(0);
  });
});
