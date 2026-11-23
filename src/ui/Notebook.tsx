import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { localDateKey } from '../core/geotime';
import { normalize } from '../core/taxonomy';
import type { Sighting } from '../core/types';
import { db } from '../db';
import { restoreSighting } from '../store';
import { useNames, useTaxonomy } from './hooks';
import { SightingSheet } from './SightingSheet';
import { dayLabel, timeOf } from './util';

type Filter = 'all' | 'pending' | 'deleted';

/** Personal archive: every sighting, whether or not it ever reaches eBird. */
export function Notebook() {
  const names = useNames();
  const { taxa } = useTaxonomy();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string>();
  const all = useLiveQuery(() => db.sightings.orderBy('observedAt').reverse().toArray(), []);
  const outings = useLiveQuery(() => db.outings.toArray(), []);
  const trips = useLiveQuery(() => db.trips.toArray(), []);
  const outingById = useMemo(() => new Map((outings ?? []).map((o) => [o.id, o])), [outings]);
  const tripById = useMemo(() => new Map((trips ?? []).map((t) => [t.id, t])), [trips]);

  const rows = useMemo(() => {
    const nq = normalize(q);
    return (all ?? []).filter((s) => {
      if (filter === 'deleted' ? !s.deleted : s.deleted) return false;
      if (filter === 'pending' && s.speciesCode) return false;
      if (!nq) return true;
      const t = s.speciesCode ? taxa.get(s.speciesCode) : undefined;
      const o = s.outingId ? outingById.get(s.outingId) : undefined;
      const hay = normalize(
        [
          t?.en,
          t?.sci,
          ...(t ? Object.values(t.names).flat() : []),
          ...(t?.codes ?? []),
          s.note,
          s.merlinSuggestion,
          o?.locationName,
          o?.ebirdChecklistId,
          s.tripId ? tripById.get(s.tripId)?.name : '',
          localDateKey(s.observedAt, s.utcOffsetMin)
        ]
          .filter(Boolean)
          .join(' ')
      );
      return nq.split(' ').every((tk) => hay.includes(tk));
    });
  }, [all, filter, q, taxa, outingById, tripById]);

  const byDay = useMemo(() => {
    const m = new Map<string, Sighting[]>();
    for (const s of rows) {
      const k = localDateKey(s.observedAt, s.utcOffsetMin);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [rows]);
  const speciesCount = new Set(rows.filter((s) => s.speciesCode).map((s) => s.speciesCode)).size;

  return (
    <div className="screen">
      <h1>Notebook</h1>
      <input
        className="text"
        type="search"
        placeholder="Search species, place, note, date (2026-11), checklist S…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search notebook"
      />
      <div className="seg" role="group" aria-label="Filter">
        {(['all', 'pending', 'deleted'] as Filter[]).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'pending' ? 'To identify' : 'Deleted'}
          </button>
        ))}
      </div>
      <div className="muted small">
        {rows.length} entries · {speciesCount} species
      </div>
      {byDay.length === 0 && <div className="empty card">No entries match.</div>}
      {byDay.map(([day, list]) => (
        <section key={day} className="stack">
          <h3>{dayLabel(list[0].observedAt, list[0].utcOffsetMin)}</h3>
          <div className="list">
            {list.map((s) => {
              const o = s.outingId ? outingById.get(s.outingId) : undefined;
              return (
                <div key={s.id} className="row" style={{ borderBottom: '1px solid var(--line)' }}>
                  <button className={`item ${s.speciesCode ? '' : 'pending'}`} style={{ borderBottom: 0 }} onClick={() => setOpen(s.id)}>
                    <span className="time">{timeOf(s.observedAt, s.utcOffsetMin)}</span>
                    <span className="grow">
                      <span className="title">{names.name(s.speciesCode)}</span>
                      <span className="sub" style={{ display: 'block' }}>
                        {[
                          names.alt(s.speciesCode),
                          s.countMode === 'present' ? 'X' : `${s.countMode === 'estimate' ? '~' : ''}${s.count}`,
                          o ? (o.locationName ?? 'in an outing') : 'not in an outing',
                          o?.ebirdChecklistId,
                          s.note
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                  {s.deleted && (
                    <button className="btn small" style={{ marginRight: 10 }} onClick={() => restoreSighting(s.id)}>
                      Restore
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {open && <SightingSheet id={open} onClose={() => setOpen(undefined)} />}
    </div>
  );
}
