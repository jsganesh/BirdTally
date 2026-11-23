import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { localDateKey, currentOffsetMin } from '../core/geotime';
import { db } from '../db';
import { addMedia, addSighting, deleteSighting, startOuting, stopOuting } from '../store';
import { AddBar } from './AddBar';
import { useNames, useSettings, useTaxonomy } from './hooks';
import { VoiceRecorder } from './recorder';
import { SightingSheet } from './SightingSheet';
import { capturePhoto, timeOf } from './util';

interface ToastState {
  id: string;
  text: string;
}

export function Today({ go }: { go: (tab: string) => void }) {
  const settings = useSettings();
  const names = useNames();
  const { info } = useTaxonomy();
  const [toast, setToast] = useState<ToastState>();
  const [open, setOpen] = useState<string>();
  const [recorder, setRecorder] = useState<VoiceRecorder>();
  const [recSecs, setRecSecs] = useState(0);

  const activeOuting = useLiveQuery(() => (settings?.activeOutingId ? db.outings.get(settings.activeOutingId) : undefined), [settings?.activeOutingId]);
  const recentRows = useLiveQuery(() => db.sightings.orderBy('observedAt').reverse().limit(400).toArray(), []);
  const tripList = useLiveQuery(async () => {
    const trip = settings?.activeTripId ? await db.trips.get(settings.activeTripId) : undefined;
    const lists = await Promise.all((trip?.countryCodes ?? []).map((c) => db.tripLists.get(c)));
    return lists.flatMap((l) => l?.codes ?? []);
  }, [settings?.activeTripId]);

  const todayKey = localDateKey(new Date().toISOString(), currentOffsetMin());
  const live = (recentRows ?? []).filter((s) => !s.deleted);
  const todays = live.filter((s) => localDateKey(s.observedAt, s.utcOffsetMin) === todayKey);
  const pendingCount = live.filter((s) => !s.speciesCode).length;
  const recent = useMemo(() => {
    const seen: string[] = [];
    for (const s of live) if (s.speciesCode && !seen.includes(s.speciesCode)) seen.push(s.speciesCode);
    return seen;
  }, [live]);
  const { taxa } = useTaxonomy();
  const chips = useMemo(() => {
    const out = recent.slice(0, 12);
    // Fill remaining slots from the downloaded trip list (needs the user's own eBird key).
    for (const c of tripList ?? []) {
      if (out.length >= 12) break;
      if (!out.includes(c) && taxa.has(c)) out.push(c);
    }
    return out;
  }, [recent, tripList, taxa]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!recorder) return;
    const t = setInterval(() => setRecSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [recorder]);

  const add = async (code: string) => {
    const s = await addSighting({ speciesCode: code });
    if (navigator.vibrate) navigator.vibrate(30);
    setToast({ id: s.id, text: `${names.name(code)} saved · ${timeOf(s.observedAt, s.utcOffsetMin)}` });
  };

  const voice = async () => {
    if (recorder) {
      const { blob, seconds } = await recorder.stop();
      setRecorder(undefined);
      const s = await addSighting({});
      await addMedia(s.id, blob, 'audio', seconds);
      setToast({ id: s.id, text: `Voice note saved (${seconds}s) · identification pending` });
      return;
    }
    const r = new VoiceRecorder();
    try {
      await r.start();
      setRecSecs(0);
      setRecorder(r);
    } catch {
      alert('Microphone permission is needed to record a voice note.');
    }
  };

  const photo = async () => {
    const f = await capturePhoto();
    if (!f) return;
    const s = await addSighting({});
    await addMedia(s.id, f, 'photo');
    setToast({ id: s.id, text: 'Photo saved · identification pending' });
  };

  const unknown = async () => {
    const s = await addSighting({});
    setToast({ id: s.id, text: 'Unknown bird saved · add a note now or later' });
    setOpen(s.id);
  };

  const backupDue = (settings?.entriesSinceBackup ?? 0) >= 25;

  return (
    <div className="screen has-addbar">
      {!info && (
        <button className="banner" onClick={() => go('setup')}>
          ⚠ Species names are not on this device yet. Open Setup to download them before you go offline.
        </button>
      )}
      {backupDue && (
        <button className="banner" onClick={() => go('setup')}>
          💾 {settings?.entriesSinceBackup} entries since your last backup. Tap to save a backup file.
        </button>
      )}

      <div className={`card outing-banner ${activeOuting ? 'active' : ''}`}>
        {activeOuting ? (
          <>
            <span className="rec-dot" aria-hidden />
            <div className="grow">
              <div style={{ fontWeight: 800 }}>Birding mode on</div>
              <div className="muted small">
                Since {timeOf(activeOuting.startedAt, activeOuting.utcOffsetMin)} · {live.filter((s) => s.outingId === activeOuting.id).length} entries
              </div>
            </div>
            <button className="btn primary" onClick={() => stopOuting()}>
              Turn off
            </button>
          </>
        ) : (
          <>
            <div className="grow">
              <div style={{ fontWeight: 800 }}>Birding mode off</div>
              <div className="muted small">Turn on when you start birding to record your real start time and duration. Or just add birds; birding sessions are suggested later.</div>
            </div>
            <button className="btn primary" onClick={() => startOuting()}>
              Turn on
            </button>
          </>
        )}
      </div>

      <div className="btn-row">
        <button className="btn" onClick={voice} aria-pressed={!!recorder} style={recorder ? { borderColor: 'var(--error)', color: 'var(--error)' } : undefined}>
          <span className="ico">{recorder ? '■' : '🎙'}</span>
          {recorder ? `Stop ${recSecs}s` : 'Voice note'}
        </button>
        <button className="btn" onClick={photo}>
          <span className="ico">📷</span>Photo
        </button>
        <button className="btn" onClick={unknown}>
          <span className="ico">?</span>Unknown bird
        </button>
      </div>

      {chips.length > 0 && (
        <section className="stack">
          <div className="section-title">
            <h2>Recent birds</h2>
            <span className="muted small">One tap adds</span>
          </div>
          <div className="chips">
            {chips.map((c) => (
              <button key={c} className="chip" onClick={() => add(c)}>
                {names.name(c)}
                {names.alt(c) && <span className="alt">{names.alt(c)}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="stack">
        <div className="section-title">
          <h2>Today</h2>
          {pendingCount > 0 && (
            <button className="pill pending" onClick={() => go('notebook')}>
              {pendingCount} to identify
            </button>
          )}
        </div>
        {todays.length === 0 ? (
          <div className="empty card">Nothing recorded today. Type a name below to add your first bird.</div>
        ) : (
          <div className="list">
            {todays.slice(0, 30).map((s) => (
              <button key={s.id} className={`item ${s.speciesCode ? '' : 'pending'}`} onClick={() => setOpen(s.id)}>
                <span className="time">{timeOf(s.observedAt, s.utcOffsetMin)}</span>
                <span className="grow">
                  <span className="title">{names.name(s.speciesCode)}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {[
                      s.countMode === 'present' ? 'X' : `${s.countMode === 'estimate' ? '~' : ''}${s.count}`,
                      s.detection === 'heard' ? 'heard' : '',
                      s.mediaIds.length ? `${s.mediaIds.length} media` : '',
                      s.positionStatus === 'ok' ? '' : s.positionStatus === 'pending' ? 'GPS…' : 'no GPS',
                      s.note ?? ''
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <AddBar recent={recent} regional={tripList} onPick={add} />

      {toast && (
        <div className="toast" role="status">
          <span className="grow">{toast.text}</span>
          <button
            onClick={async () => {
              await deleteSighting(toast.id);
              setToast({ id: toast.id, text: 'Removed' });
              setTimeout(() => setToast(undefined), 1500);
            }}
          >
            Undo
          </button>
          <button
            onClick={() => {
              setOpen(toast.id);
              setToast(undefined);
            }}
          >
            Details
          </button>
        </div>
      )}
      {open && <SightingSheet id={open} onClose={() => setOpen(undefined)} />}
    </div>
  );
}
