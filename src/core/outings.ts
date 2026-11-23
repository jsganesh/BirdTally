import { haversineKm, localDateKey, minutesBetween } from './geotime';
import type { Sighting } from './types';

/** Thresholds for proposing a new outing. Proposals only — the user confirms every one. */
export const SPLIT_GAP_MIN = 90;
export const SPLIT_DISTANCE_KM = 2;

export interface OutingProposal {
  sightingIds: string[];
  firstAt: string;
  lastAt: string;
  utcOffsetMin: number;
  tz: string;
  dateKey: string;
  /** Why this group starts where it does (shown to the user). */
  reason: string;
  /** Warnings the user should see before confirming. */
  notes: string[];
}

/**
 * Group sightings that are not yet in an outing into proposed outings.
 * Splits on: a new local calendar date, a gap longer than SPLIT_GAP_MIN, or a position more
 * than SPLIT_DISTANCE_KM from the group's first located entry.
 */
export function proposeOutings(sightings: Sighting[]): OutingProposal[] {
  const pending = sightings
    .filter((s) => !s.deleted && !s.outingId)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const out: OutingProposal[] = [];
  let cur: OutingProposal | null = null;
  let anchor: { lat: number; lng: number } | undefined;
  let prev: Sighting | null = null;

  for (const s of pending) {
    const dateKey = localDateKey(s.observedAt, s.utcOffsetMin);
    let reason = '';
    if (!cur || !prev) reason = 'First entry';
    else if (dateKey !== cur.dateKey) reason = `New calendar date (${dateKey})`;
    else if (minutesBetween(prev.observedAt, s.observedAt) > SPLIT_GAP_MIN)
      reason = `Gap of ${minutesBetween(prev.observedAt, s.observedAt)} min since the previous entry`;
    else if (anchor && s.position && haversineKm(anchor, s.position) > SPLIT_DISTANCE_KM)
      reason = `Moved ${haversineKm(anchor, s.position).toFixed(1)} km from where this outing started`;

    if (reason) {
      cur = {
        sightingIds: [],
        firstAt: s.observedAt,
        lastAt: s.observedAt,
        utcOffsetMin: s.utcOffsetMin,
        tz: s.tz,
        dateKey,
        reason,
        notes: []
      };
      out.push(cur);
      anchor = s.position ? { lat: s.position.lat, lng: s.position.lng } : undefined;
    }
    cur!.sightingIds.push(s.id);
    cur!.lastAt = s.observedAt;
    if (!anchor && s.position) anchor = { lat: s.position.lat, lng: s.position.lng };
    if (s.tz !== cur!.tz && !cur!.notes.includes('Time zone changed during this group')) cur!.notes.push('Time zone changed during this group');
    prev = s;
  }

  for (const p of out) {
    const group = pending.filter((s) => p.sightingIds.includes(s.id));
    if (group.every((s) => !s.position)) p.notes.push('No GPS for any entry — you will need to name or pick the location');
  }
  return out;
}
