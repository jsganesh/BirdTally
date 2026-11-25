// A day as the paper notebook shows it: date and place on top, one line per entry.
import { localTimeLabel } from './geotime';
import { tagMarks } from './tags';
import type { Outing, Sighting } from './types';

/** GPS state of the newest entry, so the user can see that every bird gets a position. */
export function gpsLabel(newest: Sighting | undefined): string {
  if (!newest) return 'GPS taken with each bird';
  const p = newest.position;
  if (p) return p.accuracyM ? `GPS ✓ ±${Math.round(p.accuracyM)} m` : 'GPS ✓';
  if (newest.positionStatus === 'pending') return 'Getting GPS…';
  if (newest.positionStatus === 'denied') return 'No GPS: permission off';
  return 'No GPS fix';
}

/** The day's place: its checklists' location names, else the first GPS fix. */
function dayPlace(entries: Sighting[], outings: Outing[]): string | undefined {
  const ids = new Set(entries.map((s) => s.outingId));
  const named = [...new Set(outings.filter((o) => ids.has(o.id) && o.locationName?.trim()).map((o) => o.locationName!.trim()))];
  if (named.length) return named.join(', ');
  const fix = entries.find((s) => s.position)?.position;
  return fix && `GPS ${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`;
}

/** "06:45 European Goldfinch ×3 PV ★ - note": one notebook line. */
function dayLine(s: Sighting, name: (code?: string) => string): string {
  const count = s.countMode === 'estimate' && s.count ? `~${s.count}` : s.countMode === 'exact' && (s.count ?? 1) > 1 ? `×${s.count}` : '';
  const note = s.note?.replace(/\s+/g, ' ').trim();
  return [
    localTimeLabel(s.observedAt, s.utcOffsetMin),
    s.speciesCode ? name(s.speciesCode) : 'Unknown bird (to identify)',
    count,
    tagMarks(s.tags),
    note && `- ${note}`
  ]
    .filter(Boolean)
    .join(' ');
}

/** A day as plain text, like the paper day list: date and place, then every live entry, oldest first. */
export function daySheet(title: string, entries: Sighting[], outings: Outing[], name: (code?: string) => string): string {
  const live = entries.filter((s) => !s.deleted).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const place = dayPlace(live, outings);
  return [place ? `${title} · ${place}` : title, ...live.map((s) => dayLine(s, name))].join('\n');
}
