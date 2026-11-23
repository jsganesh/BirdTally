import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { validateChecklist } from '../core/checklist';
import { proposeOutings } from '../core/outings';
import type { Outing } from '../core/types';
import { db } from '../db';
import { confirmProposal } from '../store';
import { Review, STATE_LABEL } from './ChecklistReview';
import { ExportPanel } from './ExportPanel';
import { useSettings, useTaxonomy } from './hooks';
import { dayLabel, timeOf } from './util';

export function Checklists() {
  const sightings = useLiveQuery(() => db.sightings.toArray(), []) ?? [];
  const outings = (useLiveQuery(() => db.outings.orderBy('startedAt').reverse().toArray(), []) ?? []).filter((o) => !o.deleted);
  const settings = useSettings();
  const { taxa } = useTaxonomy();
  const [openId, setOpenId] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const proposals = useMemo(() => proposeOutings(sightings.filter((s) => !s.deleted && !(s.outingId && s.outingId === settings?.activeOutingId))), [sightings, settings?.activeOutingId]);
  const live = sightings.filter((s) => !s.deleted);

  if (openId) {
    const o = outings.find((x) => x.id === openId);
    if (o) return <Review outing={o} sightings={live} outings={outings} onBack={() => setOpenId(undefined)} />;
  }
  if (exporting) return <ExportPanel outings={outings} sightings={live} onBack={() => setExporting(false)} />;

  const groups: [string, Outing[]][] = [
    ['To review', outings.filter((o) => o.submission === 'draft' || o.submission === 'needs_correction')],
    ['Ready for eBird', outings.filter((o) => o.submission === 'ready')],
    ['Exported, waiting for your confirmation', outings.filter((o) => o.submission === 'exported')],
    ['Submitted', outings.filter((o) => o.submission === 'submitted')]
  ];

  return (
    <div className="screen">
      <div className="section-title">
        <h1>Checklists</h1>
        <button className="btn small primary" onClick={() => setExporting(true)} disabled={!outings.some((o) => o.submission === 'ready')}>
          Export for eBird
        </button>
      </div>

      {proposals.length > 0 && (
        <section className="stack">
          <h2>Suggested birding sessions</h2>
          <p className="muted small" style={{ margin: 0 }}>
            These entries are not in a birding session yet. Each suggestion covers one date and one area. Confirm it, then review it as a checklist.
            Times come from your entries — they are evidence, not your real start time or effort.
          </p>
          {proposals.map((p) => {
            const list = live.filter((s) => p.sightingIds.includes(s.id));
            const species = new Set(list.filter((s) => s.speciesCode).map((s) => s.speciesCode)).size;
            return (
              <div key={p.sightingIds[0]} className="card stack">
                <div className="row">
                  <div className="grow">
                    <div style={{ fontWeight: 800 }}>
                      {dayLabel(p.firstAt, p.utcOffsetMin)} · {timeOf(p.firstAt, p.utcOffsetMin)}–{timeOf(p.lastAt, p.utcOffsetMin)}
                    </div>
                    <div className="muted small">
                      {list.length} entries · {species} species · why here: {p.reason}
                    </div>
                  </div>
                  <button className="btn primary small" onClick={() => confirmProposal(p)}>
                    Confirm
                  </button>
                </div>
                {p.notes.map((n) => (
                  <div key={n} className="issue warning">⚠ {n}</div>
                ))}
              </div>
            );
          })}
        </section>
      )}

      {outings.length === 0 && proposals.length === 0 && (
        <div className="empty card">No birding sessions yet. Turn on Birding mode on the Today screen, or just add birds and come back here for suggestions.</div>
      )}

      {groups.map(([title, list]) =>
        list.length === 0 ? null : (
          <section key={title} className="stack">
            <h2>{title}</h2>
            <div className="list">
              {list.map((o) => {
                const mine = live.filter((s) => s.outingId === o.id);
                const nSpecies = new Set(mine.filter((s) => s.speciesCode).map((s) => s.speciesCode)).size;
                const issues = validateChecklist(o, live, taxa);
                const errors = issues.filter((i) => i.severity === 'error').length;
                return (
                  <button key={o.id} className="item" onClick={() => setOpenId(o.id)}>
                    <span className="grow">
                      <span className="title">
                        {o.locationName || 'Unnamed location'} · {dayLabel(o.startedAt, o.utcOffsetMin)}
                      </span>
                      <span className="sub" style={{ display: 'block' }}>
                        {timeOf(o.startedAt, o.utcOffsetMin)} · {nSpecies} species · {o.protocol ?? 'no protocol'}
                        {o.ebirdChecklistId ? ` · ${o.ebirdChecklistId}` : ''}
                        {o.id === settings?.activeOutingId ? ' · birding mode on' : ''}
                        {errors ? ` · ${errors} to fix` : ''}
                      </span>
                    </span>
                    <span className={`pill state-${o.submission}`}>{STATE_LABEL[o.submission].split(' —')[0]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )
      )}
    </div>
  );
}
