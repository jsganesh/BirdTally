import { useState } from 'react';
import { buildLines, hasErrors, outingLocation, outingPoints, validateChecklist } from '../core/checklist';
import { formatDistance, KM_PER_MILE, localDateKey, spanKm } from '../core/geotime';
import type { Outing, Protocol, Sighting, SubmissionState } from '../core/types';
import { mergeOutings, splitOutingAt, updateOuting, updateSighting } from '../store';
import { EntrySheet } from './ExportPanel';
import { useNames, useSettings, useTaxonomy } from './hooks';
import { SightingSheet } from './SightingSheet';
import { dayLabel, parseChecklistId, timeOf } from './util';

export const STATE_LABEL: Record<SubmissionState, string> = {
  draft: 'Draft',
  ready: 'Ready for eBird',
  exported: 'Exported — not yet confirmed in eBird',
  submitted: 'Submitted',
  needs_correction: 'Needs correction'
};

export function Review({ outing: o, sightings, outings, onBack }: { outing: Outing; sightings: Sighting[]; outings: Outing[]; onBack: () => void }) {
  const { taxa } = useTaxonomy();
  const names = useNames();
  const settings = useSettings();
  const [open, setOpen] = useState<string>();
  const [subInput, setSubInput] = useState('');
  const units = settings?.units ?? 'km';
  const mine = sightings.filter((s) => s.outingId === o.id).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const lines = buildLines(o, sightings, taxa);
  const issues = validateChecklist(o, sightings, taxa);
  const blocked = hasErrors(issues);
  const loc = outingLocation(o, sightings);
  const span = spanKm(outingPoints(o, sightings));
  const set = (c: Partial<Outing>, content = true) => updateOuting(o.id, c, content);
  const sameDay = outings.filter((x) => x.id !== o.id && localDateKey(x.startedAt, x.utcOffsetMin) === localDateKey(o.startedAt, o.utcOffsetMin) && x.submission !== 'submitted');
  const fieldIssue = (f: string) => issues.find((i) => i.field === f);
  const distDisplay = o.distanceKm === undefined ? '' : units === 'mi' ? +(o.distanceKm / KM_PER_MILE).toFixed(2) : o.distanceKm;

  const protocols: { p: Protocol; help: string }[] = [
    { p: 'Incidental', help: 'Birding was not your main focus, or you can’t give real effort. Never complete.' },
    { p: 'Stationary', help: 'You stayed within about 30 m. Needs real duration.' },
    { p: 'Traveling', help: 'You moved more than 30 m. Needs real duration and distance.' },
    { p: 'Historical', help: 'You know the date but not exact start, duration or distance.' }
  ];

  return (
    <div className="screen">
      <div className="row">
        <button className="btn small" onClick={onBack}>‹ Back</button>
        <span className={`pill state-${o.submission}`}>{STATE_LABEL[o.submission]}</span>
      </div>
      <h1>
        {dayLabel(o.startedAt, o.utcOffsetMin)} · {timeOf(o.startedAt, o.utcOffsetMin)}
      </h1>
      <div className="muted small">
        {o.origin === 'tapped' ? 'Birding mode was on: start time and duration were recorded in the field.' : 'Put together from entries after the fact — times are evidence only.'}{' '}
        {loc ? `Location ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}.` : 'No GPS.'} {span > 0 ? `Entries span ${formatDistance(span, units)}.` : ''}
      </div>

      <div className="two-col">
        <div className="stack">
          <label className="field">
            Location name (as you want it in eBird)
            <input defaultValue={o.locationName ?? ''} placeholder="e.g. Tāwharanui Regional Park — North Track" onBlur={(e) => e.target.value !== (o.locationName ?? '') && set({ locationName: e.target.value || undefined })} />
          </label>
          <div className="row">
            <label className="field grow">
              Country code
              <input defaultValue={o.countryCode ?? ''} maxLength={2} placeholder="NZ" onBlur={(e) => set({ countryCode: e.target.value.toUpperCase() || undefined })} />
            </label>
            <label className="field grow">
              State/region code (optional)
              <input defaultValue={o.stateCode ?? ''} maxLength={3} placeholder="AUK" onBlur={(e) => set({ stateCode: e.target.value.toUpperCase() || undefined })} />
            </label>
          </div>

          <fieldset className="card stack" style={{ margin: 0 }}>
            <legend style={{ fontWeight: 800 }}>Protocol</legend>
            {protocols.map(({ p, help }) => (
              <label key={p} className="check" style={{ alignItems: 'flex-start' }}>
                <input type="radio" name="protocol" aria-label={p} style={{ width: 24, height: 24, flex: 'none' }} checked={o.protocol === p} onChange={() => set({ protocol: p, allReported: p === 'Incidental' ? 'no' : o.allReported })} />
                <span>
                  {p}
                  <span className="sub muted small" style={{ display: 'block', fontWeight: 400 }}>{help}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {(o.protocol === 'Stationary' || o.protocol === 'Traveling') && (
            <div className="row wrap">
              <label className="field grow">
                Duration (minutes)
                <input inputMode="numeric" defaultValue={o.durationMin ?? ''} onBlur={(e) => set({ durationMin: parseInt(e.target.value, 10) || undefined })} />
              </label>
              {o.protocol === 'Traveling' && (
                <label className="field grow">
                  Distance ({units})
                  <input
                    inputMode="decimal"
                    defaultValue={distDisplay}
                    placeholder={span ? `at least ${formatDistance(span, units)}` : ''}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      set({ distanceKm: Number.isFinite(v) && v > 0 ? (units === 'mi' ? v * KM_PER_MILE : v) : undefined });
                    }}
                  />
                </label>
              )}
              <label className="field" style={{ width: 120 }}>
                Observers
                <input inputMode="numeric" defaultValue={o.observers ?? 1} onBlur={(e) => set({ observers: parseInt(e.target.value, 10) || 1 })} />
              </label>
            </div>
          )}
          {fieldIssue('durationMin') && <div className="issue error">{fieldIssue('durationMin')!.message}</div>}

          {o.protocol && o.protocol !== 'Incidental' && (
            <div className="card stack">
              <div style={{ fontWeight: 800 }}>Did you report every species you identified by sight or sound during this birding session?</div>
              <div className="muted small">
                Answer “Yes” only if nothing identified is missing — on a complete list, a missing species means you did not detect it. Lists rebuilt from memory or photos are usually “No”.
              </div>
              <div className="seg">
                <button aria-pressed={o.allReported === 'yes'} onClick={() => set({ allReported: 'yes' })}>Yes, complete</button>
                <button aria-pressed={o.allReported === 'no'} onClick={() => set({ allReported: 'no' })}>No</button>
              </div>
            </div>
          )}

          <label className="field">
            Checklist comments
            <textarea defaultValue={o.comments ?? ''} onBlur={(e) => e.target.value !== (o.comments ?? '') && set({ comments: e.target.value || undefined })} />
          </label>
        </div>

        <div className="stack">
          <h2>Species ({lines.length})</h2>
          {lines.length === 0 && <div className="empty card">No identified species yet.</div>}
          <div className="list">
            {lines.map((l) => (
              <div key={l.speciesCode} className="item" style={{ flexWrap: 'wrap' }}>
                <span className="grow">
                  <span className="title">{l.taxon?.en ?? l.speciesCode}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {l.sightingIds.length} entr{l.sightingIds.length === 1 ? 'y' : 'ies'} · count: {l.countBasis}
                    {l.comments ? ` · ${l.comments}` : ''}
                  </span>
                </span>
                <input
                  aria-label={`Count for ${l.taxon?.en}`}
                  className="text"
                  style={{ width: 84, textAlign: 'center', fontWeight: 800 }}
                  defaultValue={String(l.count)}
                  key={`${l.speciesCode}-${l.count}`}
                  onBlur={(e) => {
                    const v = e.target.value.trim().toUpperCase();
                    const next = { ...o.countOverrides };
                    if (v === '' || v === String(l.count)) return;
                    if (v === 'X') next[l.speciesCode] = 'X';
                    else if (/^\d+$/.test(v)) next[l.speciesCode] = parseInt(v, 10);
                    else return;
                    set({ countOverrides: next });
                  }}
                />
              </div>
            ))}
          </div>
          <div className="muted small">Type a number or X (present). Several entries of one species are not added up automatically — they may be the same bird.</div>

          <h2>Entries ({mine.length})</h2>
          <div className="list">
            {mine.map((s, i) => (
              <div key={s.id} className="row" style={{ borderBottom: '1px solid var(--line)' }}>
                <button className={`item ${s.speciesCode ? '' : 'pending'}`} style={{ borderBottom: 0 }} onClick={() => setOpen(s.id)}>
                  <span className="time">{timeOf(s.observedAt, s.utcOffsetMin)}</span>
                  <span className="grow">
                    <span className="title">{names.name(s.speciesCode)}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      {s.countMode === 'present' ? 'X' : `${s.countMode === 'estimate' ? '~' : ''}${s.count}`}
                      {s.position ? '' : ' · no GPS'}
                    </span>
                  </span>
                </button>
                {i > 0 && (
                  <button className="btn small" style={{ marginRight: 6, padding: '0 10px' }} aria-label="Split: start a new birding session from this entry" title="Start a new birding session from this entry" onClick={() => confirm('Move this entry and all later ones into a new birding session?') && splitOutingAt(o.id, s.id)}>
                    Split
                  </button>
                )}
                <button className="btn small" style={{ marginRight: 10, padding: '0 12px' }} aria-label="Remove this entry from the birding session" title="Take this entry out of the birding session (it stays in your notebook)" onClick={() => updateSighting(s.id, { outingId: null })}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          {sameDay.length > 0 && (
            <div className="card stack">
              <div className="small muted">Merge another birding session from the same date into this one (only if it was the same place):</div>
              {sameDay.map((x) => (
                <button key={x.id} className="btn small" onClick={() => confirm('Merge that birding session into this one?') && mergeOutings(o.id, x.id)}>
                  Merge {timeOf(x.startedAt, x.utcOffsetMin)} {x.locationName ?? ''}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="stack">
        <h2>Checks</h2>
        {issues.length === 0 && <div className="issue warning" style={{ background: 'var(--accent-soft)', color: 'var(--text)' }}>✓ No problems found.</div>}
        {issues.map((i, k) => (
          <div key={k} className={`issue ${i.severity}`}>
            {i.severity === 'error' ? '✕' : '⚠'} {i.message}
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2>eBird status</h2>
        {o.submission === 'draft' || o.submission === 'needs_correction' ? (
          <button className="btn primary" disabled={blocked} onClick={() => set({ submission: 'ready' }, false)}>
            {blocked ? 'Fix the errors above first' : 'Mark ready for eBird'}
          </button>
        ) : o.submission === 'ready' ? (
          <div className="muted small">Ready. Use “Export for eBird” on the Checklists screen, or enter it by hand in eBird Mobile or ebird.org/submit.</div>
        ) : null}
        {(o.submission === 'exported' || o.submission === 'ready' || o.submission === 'submitted') && (
          <>
            <label className="field">
              eBird checklist link or ID (after eBird has accepted it)
              <input placeholder="https://ebird.org/checklist/S123456789" value={subInput || o.ebirdChecklistId || ''} onChange={(e) => setSubInput(e.target.value)} />
            </label>
            <div className="row wrap">
              <button
                className="btn primary small"
                onClick={() => {
                  const id = parseChecklistId(subInput || o.ebirdChecklistId || '');
                  if (!id) return alert('That doesn’t look like an eBird checklist ID (S followed by digits).');
                  set({ ebirdChecklistId: id, submission: 'submitted' }, false);
                }}
              >
                Confirm submitted
              </button>
              {o.ebirdChecklistId && (
                <a className="btn small" href={`https://ebird.org/checklist/${o.ebirdChecklistId}`} target="_blank" rel="noreferrer">
                  Open in eBird
                </a>
              )}
              {o.submission !== 'submitted' && (
                <button className="btn small" onClick={() => set({ submission: 'needs_correction' }, false)}>
                  Needs correction
                </button>
              )}
            </div>
          </>
        )}
        <EntrySheet outing={o} sightings={sightings} />
      </section>
      {open && <SightingSheet id={open} onClose={() => setOpen(undefined)} />}
    </div>
  );
}

/** Compact view for typing a checklist into eBird Mobile or ebird.org/submit by hand. */
