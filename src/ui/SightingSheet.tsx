import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { searchTaxa } from '../core/taxonomy';
import type { CountMode, Detection, Sighting } from '../core/types';
import { db } from '../db';
import { addMedia, deleteSighting, restoreSighting, updateSighting } from '../store';
import { DraftField } from './DraftField';
import { useNames, useTaxonomy } from './hooks';
import { VoiceRecorder } from './recorder';
import { useVoiceNote } from './useVoiceNote';
import { capturePhoto, dayLabel, timeOf } from './util';

function MediaView({ id }: { id: string }) {
  const rec = useLiveQuery(() => Promise.all([db.media.get(id), db.mediaBlobs.get(id)]), [id]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!rec?.[1]) return;
    const u = URL.createObjectURL(rec[1].blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [rec]);
  if (!rec?.[0] || !url) return null;
  return rec[0].kind === 'audio' ? <audio controls src={url} /> : <img src={url} alt="Field photo" />;
}

function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Edit sighting" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function SightingSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useLiveQuery(() => db.sightings.get(id), [id]);
  const names = useNames();
  const { index } = useTaxonomy();
  const [changing, setChanging] = useState(false);
  const [q, setQ] = useState('');
  const voice = useVoiceNote(async (blob, seconds) => {
    await addMedia(id, blob, 'audio', seconds);
  });
  const hits = useMemo(() => (q.trim() ? searchTaxa(index, q, { limit: 8 }) : []), [q, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!s) return null;
  const set = (c: Partial<Sighting>) => updateSighting(s.id, c);
  const pending = !s.speciesCode;

  // A deleted entry offers only Restore, so it can't be deleted twice or edited unseen.
  if (s.deleted)
    return (
      <Sheet onClose={onClose}>
        <div className="sheet-head">
          <h2 className="grow">{names.name(s.speciesCode)}</h2>
          <button className="btn small" onClick={onClose}>Close</button>
        </div>
        <div className="issue warning">This entry is deleted. It is out of your lists and eBird exports.</div>
        <button className="btn primary" onClick={() => restoreSighting(s.id)}>Restore</button>
      </Sheet>
    );

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <div className="grow">
          <h2 style={{ color: pending ? 'var(--pending)' : undefined }}>{names.name(s.speciesCode)}</h2>
          <div className="muted small">
            {[names.alt(s.speciesCode), names.sci(s.speciesCode)].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button className="btn small danger" onClick={() => deleteSighting(s.id)}>Delete</button>
        <button className="btn small" onClick={onClose}>Done</button>
      </div>

      <div className="muted small">
        {dayLabel(s.observedAt, s.utcOffsetMin)} {timeOf(s.observedAt, s.utcOffsetMin)} ({s.tz}) ·{' '}
        {s.position
          ? `GPS ${s.position.lat.toFixed(5)}, ${s.position.lng.toFixed(5)}${s.position.accuracyM ? ` ±${s.position.accuracyM} m` : ''}`
          : s.positionStatus === 'pending'
            ? 'Getting GPS…'
            : s.positionStatus === 'denied'
              ? 'No GPS: location permission is off'
              : 'No GPS fix'}
      </div>

      {changing || pending ? (
        <div className="stack">
          <label className="field">
            {pending ? 'Identify' : 'Change species'}
            <input autoFocus={changing} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or code" autoComplete="off" autoCapitalize="none" />
          </label>
          {hits.length > 0 && (
            <div className="list">
              {hits.map((h) => (
                <button
                  key={h.taxon.code}
                  className="item"
                  onClick={async () => {
                    await set({ speciesCode: h.taxon.code });
                    setChanging(false);
                    setQ('');
                  }}
                >
                  <span className="grow">
                    <span className="title">{h.taxon.en}</span>
                    <span className="sub" style={{ display: 'block' }}>{h.taxon.sci}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {changing && <button className="btn small" onClick={() => setChanging(false)}>Cancel</button>}
        </div>
      ) : (
        <div className="row wrap">
          <button className="btn small" onClick={() => setChanging(true)}>Change species</button>
          <button className="btn small" onClick={() => set({ speciesCode: undefined })}>Mark identification pending</button>
        </div>
      )}

      <div className="stack">
        <div className="seg" role="group" aria-label="Count">
          {(['present', 'estimate', 'exact'] as CountMode[]).map((m) => (
            <button
              key={m}
              aria-pressed={s.countMode === m}
              onClick={() => set({ countMode: m, count: m === 'present' ? undefined : (s.count ?? 1) })}
            >
              {m === 'present' ? 'Present (X)' : m === 'estimate' ? 'About' : 'Exactly'}
            </button>
          ))}
        </div>
        {s.countMode !== 'present' && (
          <div className="stepper">
            <button aria-label="One fewer" onClick={() => set({ count: Math.max(1, (s.count ?? 1) - 1) })}>−</button>
            <DraftField
              aria-label="Count"
              inputMode="numeric"
              stored={String(s.count ?? '')}
              onSave={(text) => {
                const v = parseInt(text, 10);
                set({ count: Number.isFinite(v) && v > 0 ? v : undefined });
              }}
            />
            <button aria-label="One more" onClick={() => set({ count: (s.count ?? 0) + 1 })}>+</button>
            <button className="btn small" onClick={() => set({ count: (s.count ?? 0) + 10 })}>+10</button>
          </div>
        )}
        <div className="seg" role="group" aria-label="Seen or heard">
          {(['seen', 'heard', 'both'] as Detection[]).map((d) => (
            <button key={d} aria-pressed={s.detection === d} onClick={() => set({ detection: d })}>
              {d === 'seen' ? 'Seen' : d === 'heard' ? 'Heard only' : 'Seen + heard'}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        Note
        <DraftField multiline stored={s.note ?? ''} onSave={(v) => set({ note: v || undefined })} />
      </label>
      <label className="field">
        Merlin suggested (typed by you; nothing is synced from Merlin)
        <DraftField stored={s.merlinSuggestion ?? ''} onSave={(v) => set({ merlinSuggestion: v || undefined })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={!!s.possibleCaptive} onChange={(e) => set({ possibleCaptive: e.target.checked })} />
        Possibly captive or escaped
      </label>

      {s.mediaIds.length > 0 && (
        <div className="stack thumbs">
          {s.mediaIds.map((m) => (
            <MediaView key={m} id={m} />
          ))}
        </div>
      )}
      <div className="row wrap">
        {VoiceRecorder.supported() && (
          <button className="btn small" onClick={voice.toggle}>
            {voice.recording ? '■ Stop recording' : '🎙 Add voice note'}
          </button>
        )}
        <button
          className="btn small"
          onClick={async () => {
            const f = await capturePhoto();
            if (f) await addMedia(s.id, f, 'photo');
          }}
        >
          📷 Add photo
        </button>
      </div>

      {s.idHistory.length > 1 && (
        <details>
          <summary className="small">Identification history ({s.idHistory.length})</summary>
          <ul className="small">
            {s.idHistory.map((h, i) => (
              <li key={i}>
                {new Date(h.at).toLocaleString()}: {names.name(h.speciesCode)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Sheet>
  );
}
