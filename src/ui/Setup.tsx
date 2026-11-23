import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db';
import {
  buildBackup,
  createTrip,
  downloadRegionList,
  downloadTaxonomy,
  importFile,
  markBackedUp,
  requestPersistentStorage,
  resolveConflict,
  updateSettings,
  type ImportSummary
} from '../store';
import { useNames, useOnline, useSettings, useTaxonomy } from './hooks';
import { Check, PinSetting } from './SetupControls';
import { pickFile, saveFile, sha256, stamp } from './util';

/** eBird locales that are useful here; any other eBird locale code can be typed. */
const LOCALES: { code: string; label: string }[] = [
  { code: 'mi', label: 'Te reo Māori' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt_BR', label: 'Portuguese (Brazil)' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'id', label: 'Indonesian' },
  { code: 'th', label: 'Thai' }
];

export function Setup() {
  const settings = useSettings();
  const online = useOnline();
  const { info } = useTaxonomy();
  const names = useNames();
  const trips = useLiveQuery(() => db.trips.toArray(), []) ?? [];
  const conflicts = useLiveQuery(() => db.conflicts.filter((c) => !c.resolved).toArray(), []) ?? [];
  const regionLists = useLiveQuery(() => db.tripLists.toArray(), []) ?? [];
  const [locales, setLocales] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [persisted, setPersisted] = useState<boolean>();
  const [geo, setGeo] = useState<string>('unknown');
  const [swReady, setSwReady] = useState(false);
  const [tripName, setTripName] = useState('');
  const [tripCountries, setTripCountries] = useState('');
  const [importMsg, setImportMsg] = useState<string>();

  useEffect(() => {
    if (settings && locales.length === 0) setLocales(settings.displayLocales.filter((l) => l !== 'en'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.displayLocales.join()]);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(false));
    navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then((p) => setGeo(p.state)).catch(() => setGeo('unknown'));
    navigator.serviceWorker?.getRegistration().then((r) => setSwReady(!!r?.active));
  }, [progress]);

  if (!settings) return null;

  const download = async () => {
    setBusy(true);
    try {
      await downloadTaxonomy(locales, setProgress);
      setPersisted(await requestPersistentStorage());
    } catch (e) {
      setProgress(`Download failed: ${(e as Error).message}. You need a connection for this step.`);
    } finally {
      setBusy(false);
    }
  };

  const backup = async (kind: 'backup' | 'trip') => {
    const data = await buildBackup(kind);
    const text = JSON.stringify(data);
    const name = `birdtally-${kind}-${settings.deviceName.replace(/\W+/g, '')}-${stamp()}.json`;
    try {
      await saveFile(name, text, 'application/json');
      if (kind === 'backup') await markBackedUp();
      setImportMsg(`Saved ${name} (${(text.length / 1024 / 1024).toFixed(2)} MB, sha256 ${(await sha256(text)).slice(0, 10)}…).`);
    } catch {
      /* share cancelled */
    }
  };

  const doImport = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      const r: ImportSummary = await importFile(await f.text());
      setImportMsg(`Merged file from ${r.from}: ${r.added} new, ${r.updated} updated${r.conflicts ? `, ${r.conflicts} conflicts to review below` : ''}.`);
    } catch (e) {
      setImportMsg(`Could not import: ${(e as Error).message}`);
    }
  };

  const ready = !!info && (persisted ?? false);

  return (
    <div className="screen">
      <h1>Setup</h1>

      <section className="card stack">
        <h2>1 · Prepare for offline birding</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Downloads the official eBird taxonomy (no account or key needed) and keeps it on this device. Do this on Wi-Fi before you travel.
        </p>
        <div className="stack">
          <div style={{ fontWeight: 700 }}>Name languages (English is always included)</div>
          <div className="row wrap">
            {LOCALES.map((l) => (
              <label key={l.code} className="check" style={{ minWidth: 150 }}>
                <input type="checkbox" checked={locales.includes(l.code)} onChange={(e) => setLocales(e.target.checked ? [...locales, l.code] : locales.filter((x) => x !== l.code))} />
                {l.label}
              </label>
            ))}
          </div>
          <div className="row">
            <input className="text grow" placeholder="Other eBird locale code, e.g. ko" value={extra} onChange={(e) => setExtra(e.target.value.trim())} />
            <button className="btn small" disabled={!extra} onClick={() => (setLocales([...new Set([...locales, extra])]), setExtra(''))}>
              Add
            </button>
          </div>
        </div>
        <button className="btn primary big" disabled={busy || !online} onClick={download}>
          {busy ? 'Downloading…' : online ? (info ? 'Update species names' : 'Download species names') : 'Connect to the internet to download'}
        </button>
        {progress && <div className="small">{progress}</div>}

        <div className="stack" aria-label="Offline readiness">
          <div style={{ fontWeight: 800 }}>Offline check</div>
          <Check ok={!!info} label={info ? `Species names: eBird taxonomy ${info.version}, ${info.count.toLocaleString()} taxa, languages ${info.locales.join(', ')}` : 'Species names not downloaded'} />
          <Check ok={swReady} label={swReady ? 'App saved for offline use' : 'App not yet saved for offline use (open it once while online, then reload)'} />
          <Check ok={!!persisted} label={persisted ? 'Storage protected from automatic clearing' : 'Storage may be cleared by the system — add BirdTally to your Home Screen and keep backups'} />
          <Check ok={geo === 'granted'} warnOnly label={geo === 'granted' ? 'Location allowed' : 'Location permission not yet granted (asked on your first bird)'} />
          {ready && <div className="banner info">✓ Ready to record without a connection.</div>}
        </div>
      </section>

      <section className="card stack">
        <h2>2 · Trip</h2>
        <p className="muted small" style={{ margin: 0 }}>
          New entries are tagged with the active trip. Country codes are used for checklists and the optional regional species list.
        </p>
        {trips.length > 0 && (
          <label className="field">
            Active trip
            <select value={settings.activeTripId ?? ''} onChange={(e) => updateSettings({ activeTripId: e.target.value || undefined })}>
              <option value="">No trip (home birding)</option>
              {trips
                .filter((t) => !t.deleted)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.countryCodes.join(', ')})
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="row wrap">
          <input className="text grow" placeholder="New trip name, e.g. Borneo 2027" value={tripName} onChange={(e) => setTripName(e.target.value)} />
          <input className="text" style={{ width: 150 }} placeholder="Countries: MY,ID" value={tripCountries} onChange={(e) => setTripCountries(e.target.value)} />
          <button
            className="btn small"
            disabled={!tripName.trim()}
            onClick={async () => {
              await createTrip(
                tripName.trim(),
                tripCountries
                  .split(/[ ,]+/)
                  .map((c) => c.trim().toUpperCase())
                  .filter((c) => /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(c))
              );
              setTripName('');
              setTripCountries('');
            }}
          >
            Create trip
          </button>
        </div>
        <details>
          <summary className="small" style={{ fontWeight: 700 }}>Optional: regional species list (needs your own eBird API key)</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <p className="muted small" style={{ margin: 0 }}>
              With a personal key from ebird.org/api/keygen, BirdTally can download the species reported in each trip country and show them as quick-add buttons.
              eBird’s terms don’t allow a shared key, so the key you enter stays on this device and is only sent to api.ebird.org.
            </p>
            <input className="text" type="password" placeholder="Your eBird API key" defaultValue={settings.ebirdApiKey ?? ''} onBlur={(e) => updateSettings({ ebirdApiKey: e.target.value.trim() || undefined })} />
            <button
              className="btn small"
              disabled={!settings.ebirdApiKey || !online || !settings.activeTripId}
              onClick={async () => {
                const t = trips.find((x) => x.id === settings.activeTripId);
                try {
                  const counts = await Promise.all((t?.countryCodes ?? []).map((c) => downloadRegionList(c, settings.ebirdApiKey!)));
                  setProgress(`Regional lists saved: ${counts.reduce((a, b) => a + b, 0)} species.`);
                } catch (e) {
                  setProgress((e as Error).message);
                }
              }}
            >
              Download list for active trip
            </button>
            {regionLists.length > 0 && <div className="small muted">Saved: {regionLists.map((r) => `${r.key} (${r.codes.length})`).join(', ')}</div>}
          </div>
        </details>
      </section>

      <section className="card stack">
        <h2>3 · Backup and moving data</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Everything is stored only on this device. A backup is one open JSON file (entries, outings, voice notes and photos). Use “Import” on another device —
          for example your Mac or second phone — to merge it; nothing is overwritten silently.
        </p>
        <div className="muted small">
          Last backup: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : 'never'} · {settings.entriesSinceBackup} entries since
        </div>
        <div className="row wrap">
          <button className="btn primary" onClick={() => backup('backup')}>Save backup file</button>
          <button className="btn" onClick={doImport}>Import / merge a file</button>
        </div>
        {importMsg && <div className="small">{importMsg}</div>}
        {conflicts.length > 0 && (
          <div className="stack">
            <h3>Edited on two devices ({conflicts.length})</h3>
            {conflicts.map((c) => {
              const kept = c.kept as { speciesCode?: string; count?: number; note?: string; updatedAt: string };
              const other = c.other as typeof kept;
              return (
                <div key={c.id} className="card stack">
                  <div className="small">
                    {c.table === 'sightings' ? 'Sighting' : c.table === 'outings' ? 'Birding session' : 'Trip'} was changed on two devices.
                  </div>
                  <div className="small">
                    Now: <b>{c.table === 'sightings' ? names.name(kept.speciesCode) : ''}</b> {kept.count ?? ''} {kept.note ?? ''} ({new Date(kept.updatedAt).toLocaleString()})
                  </div>
                  <div className="small">
                    Other: <b>{c.table === 'sightings' ? names.name(other.speciesCode) : ''}</b> {other.count ?? ''} {other.note ?? ''} ({new Date(other.updatedAt).toLocaleString()})
                  </div>
                  <div className="row">
                    <button className="btn small" onClick={() => resolveConflict(c.id, false)}>Keep current</button>
                    <button className="btn small" onClick={() => resolveConflict(c.id, true)}>Use other</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>4 · Preferences</h2>
        <label className="field">
          Device name (shown in backup files)
          <input defaultValue={settings.deviceName} onBlur={(e) => updateSettings({ deviceName: e.target.value || 'Device' })} />
        </label>
        <div className="stack">
          <div style={{ fontWeight: 700 }}>Distance units</div>
          <div className="seg">
            <button aria-pressed={settings.units === 'km'} onClick={() => updateSettings({ units: 'km' })}>Kilometres</button>
            <button aria-pressed={settings.units === 'mi'} onClick={() => updateSettings({ units: 'mi' })}>Miles</button>
          </div>
          <div className="muted small">eBird import files always use miles; BirdTally converts.</div>
        </div>
        <div className="stack">
          <div style={{ fontWeight: 700 }}>Appearance</div>
          <div className="seg">
            {(['auto', 'light', 'dark'] as const).map((t) => (
              <button key={t} aria-pressed={settings.theme === t} onClick={() => updateSettings({ theme: t })}>
                {t === 'auto' ? 'Automatic' : t === 'light' ? 'Bright sun' : 'Dark / dawn'}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          Default number of observers
          <input inputMode="numeric" defaultValue={settings.defaultObservers} onBlur={(e) => updateSettings({ defaultObservers: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
        </label>
        <PinSetting hasPin={!!settings.pinHash} />
      </section>

      <section className="stack small muted">
        <div>
          BirdTally is not affiliated with the Cornell Lab of Ornithology. It never signs in to eBird or Merlin and never submits anything for you: you upload the
          files it makes. Species names: eBird taxonomy via the eBird API.
        </div>
        <div className="row wrap">
          <a href="https://clicksbyg.com/birdtally/privacy/" target="_blank" rel="noreferrer">Privacy</a>
          <a href="https://clicksbyg.com/birdtally/support/" target="_blank" rel="noreferrer">Support</a>
          <a href="https://github.com/jsganesh/BirdTally/blob/main/LICENSE" target="_blank" rel="noreferrer">MIT licence</a>
        </div>
      </section>
    </div>
  );
}
