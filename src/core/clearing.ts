import type { Sighting } from './types';

const DAY_MS = 86_400_000;

/**
 * A deleted entry that still has its details, and was deleted at least `minAgeDays` ago (`updatedAt` is the delete).
 * `touch` can stamp a record a millisecond ahead of the clock, so a negative age counts as zero.
 */
export function clearable(s: Sighting, now: number, minAgeDays: number): boolean {
  return !!s.deleted && !s.cleared && Math.max(0, now - Date.parse(s.updatedAt)) >= minAgeDays * DAY_MS;
}

/**
 * What is left of a cleared entry: no species, note, position, count or media, only the identity and "deleted" mark
 * a merge needs. A phone or backup that still holds the live copy then cannot bring the bird back, because this
 * newer delete still wins.
 */
export function stripSighting(s: Sighting): Sighting {
  const { id, createdAt, updatedAt, deviceId, history, tripId, observedAt, tz, utcOffsetMin } = s;
  return {
    id, createdAt, updatedAt, deviceId, history, tripId, observedAt, tz, utcOffsetMin,
    deleted: true,
    cleared: true,
    outingId: null,
    positionStatus: 'unavailable',
    countMode: 'present',
    detection: 'seen',
    mediaIds: [],
    idHistory: []
  };
}
