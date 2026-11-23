import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { buildLines, hasErrors, outingLocation, outingPoints, validateChecklist } from '../core/checklist';
import { EBIRD_COLUMNS, outingRows, toCsvFiles, type CsvFile } from '../core/ebirdCsv';
import { formatDistance, KM_PER_MILE, localDateKey, spanKm } from '../core/geotime';
import { proposeOutings } from '../core/outings';
import { newId } from '../core/records';
import type { Outing, Protocol, Sighting, SubmissionState } from '../core/types';
import { db } from '../db';
import { confirmProposal, mergeOutings, splitOutingAt, updateOuting, updateSighting } from '../store';
import { useNames, useSettings, useTaxonomy } from './hooks';
import { SightingSheet } from './SightingSheet';
import { dayLabel, parseChecklistId, saveFile, sha256, stamp, timeOf } from './util';

const STATE_LABEL: Record<SubmissionState, string> = {
  draft: 'Draft',
  ready: 'Ready for eBird',
  exported: 'Exported — not yet confirmed in eBird',
  submitted: 'Submitted',
  needs_correction: 'Needs correction'
};

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
          <h2>Suggested outings</h2>
          <p className="muted small" style={{ margin: 0 }}>
            These entries are not in an outing yet. Each suggestion covers one date and one area. Confirm it, then review it as a checklist.
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
        <div className="empty card">No outings yet. Tap Start on the Today screen, or add birds and come back here for suggestions.</div>
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
                        {o.id === settings?.activeOutingId ? ' · in progress' : ''}
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

function Review({ outing: o, sightings, outings, onBack }: { outing: Outing; sightings: Sighting[]; outings: Outing[]; onBack: () => void }) {
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
        {o.origin === 'tapped' ? 'Start/Stop tapped in the field.' : 'Put together from entries after the fact — times are evidence only.'}{' '}
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
              <div style={{ fontWeight: 800 }}>Did you report every species you identified by sight or sound during this outing?</div>
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
                  <button className="btn small" style={{ marginRight: 6, padding: '0 10px' }} aria-label="Split: start a new outing from this entry" title="Start a new outing from this entry" onClick={() => confirm('Move this entry and all later ones into a new outing?') && splitOutingAt(o.id, s.id)}>
                    Split
                  </button>
                )}
                <button className="btn small" style={{ marginRight: 10, padding: '0 12px' }} aria-label="Remove this entry from the outing" title="Take this entry out of the outing (it stays in your notebook)" onClick={() => updateSighting(s.id, { outingId: null })}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          {sameDay.length > 0 && (
            <div className="card stack">
              <div className="small muted">Merge another outing from the same date into this one (only if it was the same place):</div>
              {sameDay.map((x) => (
                <button key={x.id} className="btn small" onClick={() => confirm('Merge that outing into this one?') && mergeOutings(o.id, x.id)}>
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
function EntrySheet({ outing: o, sightings }: { outing: Outing; sightings: Sighting[] }) {
  const { taxa } = useTaxonomy();
  const settings = useSettings();
  const lines = buildLines(o, sightings, taxa);
  const loc = outingLocation(o, sightings);
  const text = [
    `Date: ${dayLabel(o.startedAt, o.utcOffsetMin)}  Start: ${timeOf(o.startedAt, o.utcOffsetMin)}`,
    `Location: ${o.locationName ?? ''} ${loc ? `(${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})` : ''}`,
    `Protocol: ${o.protocol ?? '-'}${o.durationMin ? `  Duration: ${o.durationMin} min` : ''}${o.distanceKm ? `  Distance: ${formatDistance(o.distanceKm, settings?.units ?? 'km')}` : ''}  Observers: ${o.observers ?? 1}`,
    `Complete: ${o.protocol === 'Incidental' ? 'No' : o.allReported === 'yes' ? 'Yes' : o.allReported === 'no' ? 'No' : '?'}`,
    '',
    ...lines.map((l) => `${String(l.count).padStart(4)}  ${l.taxon?.en ?? l.speciesCode}${l.comments ? `  — ${l.comments}` : ''}`)
  ].join('\n');
  return (
    <details>
      <summary style={{ fontWeight: 700, minHeight: 44, display: 'flex', alignItems: 'center' }}>Entry sheet for typing into eBird</summary>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', background: 'var(--surface-2)', padding: 12, borderRadius: 10 }}>{text}</pre>
      <button className="btn small" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
    </details>
  );
}

function ExportPanel({ outings, sightings, onBack }: { outings: Outing[]; sightings: Sighting[]; onBack: () => void }) {
  const { taxa } = useTaxonomy();
  const settings = useSettings();
  const ready = outings.filter((o) => o.submission === 'ready');
  const [selected, setSelected] = useState<string[]>(ready.map((o) => o.id));
  const [done, setDone] = useState<CsvFile[]>();
  const chosen = ready.filter((o) => selected.includes(o.id));
  const rows = chosen.flatMap((o) => outingRows(o, sightings, taxa, settings?.defaultObservers ?? 1));
  const blocked = chosen.some((o) => hasErrors(validateChecklist(o, sightings, taxa)));
  const history = useLiveQuery(() => db.exports.orderBy('createdAt').reverse().limit(20).toArray(), []) ?? [];

  const doExport = async () => {
    const files = toCsvFiles(rows, `birdtally-ebird-${stamp()}`);
    for (const f of files) {
      const hash = await sha256(f.text);
      const dup = await db.exports.filter((e) => e.sha256 === hash).first();
      if (dup && !confirm(`This exact file was already exported on ${new Date(dup.createdAt).toLocaleString()}. Uploading it again would duplicate checklists in eBird. Export anyway?`)) return;
      await saveFile(f.name, f.text, 'text/csv');
      const versions = chosen.filter((o) => f.outingIds.includes(o.id)).map((o) => ({ outingId: o.id, version: o.version }));
      await db.exports.put({ id: newId(), createdAt: new Date().toISOString(), fileName: f.name, sha256: hash, bytes: f.bytes, rows: f.rows, outings: versions });
      for (const v of versions) await updateOuting(v.outingId, { submission: 'exported', exportedVersion: v.version }, false);
    }
    setDone(files);
  };

  return (
    <div className="screen">
      <div className="row">
        <button className="btn small" onClick={onBack}>‹ Back</button>
        <h1 className="grow">Export for eBird</h1>
      </div>
      {done ? (
        <div className="card stack">
          <h2>Ready for eBird — not submitted yet</h2>
          <p style={{ margin: 0 }}>
            Saved {done.map((f) => f.name).join(', ')}. To submit: on ebird.org choose <b>Submit → Import Data</b>, pick <b>eBird Record Format</b>, upload the file,
            then fix any unmatched species or locations and click <b>Apply Fixes</b>.
          </p>
          <p className="muted small" style={{ margin: 0 }}>
            Photos are never part of the file. Add them afterwards on each eBird checklist with “Add Media”. When eBird shows the checklist, paste its link into the
            checklist here and tap “Confirm submitted”.
          </p>
          <div className="row wrap">
            <a className="btn small" href="https://support.ebird.org/support/solutions/articles/48000907878" target="_blank" rel="noreferrer">eBird import help</a>
            <a className="btn small" href="https://ebird.org/import/status/all.htm?theme=ebird" target="_blank" rel="noreferrer">eBird import status</a>
            <button className="btn small primary" onClick={onBack}>Done</button>
          </div>
        </div>
      ) : (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            eBird Record Format: no header row, one row per species, at most 1 MB per file. Check the preview before saving.
          </p>
          <div className="list">
            {ready.map((o) => (
              <label key={o.id} className="item">
                <input type="checkbox" style={{ width: 24, height: 24 }} checked={selected.includes(o.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id))} />
                <span className="grow">
                  <span className="title">{o.locationName || 'Unnamed location'}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {dayLabel(o.startedAt, o.utcOffsetMin)} {timeOf(o.startedAt, o.utcOffsetMin)} · {o.protocol}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <h2>Preview ({rows.length} rows)</h2>
          <div className="table-wrap" style={{ maxHeight: 320 }}>
            <table>
              <thead>
                <tr>
                  {EBIRD_COLUMNS.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {r.cells.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted small">The column names above are for your reference only; the file has no header row.</div>
          <button className="btn primary big" disabled={!rows.length || blocked} onClick={doExport}>
            {blocked ? 'A selected checklist has errors' : `Save eBird file (${chosen.length} checklist${chosen.length === 1 ? '' : 's'})`}
          </button>
        </>
      )}
      {history.length > 0 && (
        <section className="stack">
          <h2>Export history</h2>
          <div className="list">
            {history.map((e) => (
              <div key={e.id} className="item">
                <span className="grow">
                  <span className="title">{e.fileName}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {new Date(e.createdAt).toLocaleString()} · {e.outings.length} checklists · {e.rows} rows · {(e.bytes / 1024).toFixed(1)} KB · sha256 {e.sha256.slice(0, 10)}…
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
