import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { buildLines, hasErrors, outingLocation, validateChecklist } from '../core/checklist';
import { EBIRD_COLUMNS, outingRows, toCsvFiles, type CsvFile } from '../core/ebirdCsv';
import { formatDistance } from '../core/geotime';
import { newId } from '../core/records';
import type { Outing, Sighting } from '../core/types';
import { db } from '../db';
import { updateOuting } from '../store';
import { useSettings, useTaxonomy } from './hooks';
import { dayLabel, saveFile, sha256, stamp, timeOf } from './util';

export function EntrySheet({ outing: o, sightings }: { outing: Outing; sightings: Sighting[] }) {
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

export function ExportPanel({ outings, sightings, onBack }: { outings: Outing[]; sightings: Sighting[]; onBack: () => void }) {
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
