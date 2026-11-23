import { useLiveQuery } from 'dexie-react-hooks';
import type { Conflict, Outing, Sighting, Trip } from '../core/types';
import { db } from '../db';
import { resolveConflict } from '../store';
import { useNames } from './hooks';

const KIND: Record<Conflict['table'], string> = { sightings: 'Sighting', outings: 'Birding session', trips: 'Trip' };

/** Records that were changed on two devices; the user picks which version stays. */
export function Conflicts() {
  const names = useNames();
  const conflicts = useLiveQuery(() => db.conflicts.filter((c) => !c.resolved).toArray(), []) ?? [];
  if (conflicts.length === 0) return null;

  const summary = (table: Conflict['table'], rec: unknown) => {
    const r = rec as Sighting & Outing & Trip;
    if (r.deleted) return 'Deleted';
    if (table === 'sightings') return [names.name(r.speciesCode), r.count, r.note].filter((x) => x !== undefined && x !== '').join(' · ');
    if (table === 'outings') return [r.locationName ?? 'Unnamed location', r.protocol, r.comments].filter(Boolean).join(' · ');
    return r.name;
  };

  return (
    <div className="stack">
      <h3>Edited on two devices ({conflicts.length})</h3>
      {conflicts.map((c) => (
        <div key={c.id} className="card stack">
          <div className="small">{KIND[c.table]} was changed on two devices.</div>
          {(['kept', 'other'] as const).map((side) => (
            <div key={side} className="small">
              {side === 'kept' ? 'Now' : 'Other'}: <b>{summary(c.table, c[side])}</b> ({new Date((c[side] as { updatedAt: string }).updatedAt).toLocaleString()})
            </div>
          ))}
          <div className="row">
            <button className="btn small" onClick={() => resolveConflict(c.id, false)}>Keep current</button>
            <button className="btn small" onClick={() => resolveConflict(c.id, true)}>Use other</button>
          </div>
        </div>
      ))}
    </div>
  );
}
