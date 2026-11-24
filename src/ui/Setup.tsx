import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db';
import {
  buildBackup,
  createTrip,
  downloadTaxonomy,
  importFile,
  markBackedUp,
  MAX_IMPORT_BYTES,
  requestPersistentStorage,
  updateSettings,
  type ImportSummary
} from '../store';
import { addRegionCode } from '../core/region';
import { useOnline, useSettings, useTaxonomy } from './hooks';
import { Conflicts } from './Conflicts';
import { DraftField } from './DraftField';
import { RegionKeyGuide } from './RegionKeyGuide';
import { RegionPicker } from './RegionPicker';
import { Check } from './SetupControls';
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
  const trips = useLiveQuery(() => db.trips.toArray(), []) ?? [];
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
    if (f.size > MAX_IMPORT_BYTES) return setImportMsg(`Could not import: the file is ${(f.size / 1e6).toFixed(0)} MB; the limit is ${MAX_IMPORT_BYTES / 1e6} MB.`);
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
            <input className="text grow" aria-label="Other eBird locale code" placeholder="Other eBird locale code, e.g. ko" value={extra} onChange={(e) => setExtra(e.target.value.trim())} />
            <button className="btn small" disabled={!extra} onClick={() => (setLocales([...new Set([...locales, extra])]), setExtra(''))}>
              Add
            </button>
          </div>
        </div>
        <button className="btn primary big" disabled={busy || !online} onClick={download}>
          {busy ? 'Downloading…' : online ? (info ? 'Update species names' : 'Download species names') : 'Connect to the internet to download'}
        </button>
        {progress && <div className="small" role="status">{progress}</div>}

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
          New entries are tagged with the active trip. A region code is a country (NZ) or an area in it (NZ-AUK for Auckland); you will find it in the address of any eBird region page, such as ebird.org/region/NZ-AUK. It is used for checklists and the optional unusual-bird warning.
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
        <RegionPicker onAdd={(code) => setTripCountries(addRegionCode(tripCountries, code))} />
        <div className="row wrap">
          <input className="text" style={{ flex: '1 1 100%' }} aria-label="New trip name" placeholder="New trip name, e.g. Borneo 2027" value={tripName} onChange={(e) => setTripName(e.target.value)} />
          <input className="text grow" aria-label="Trip region codes" placeholder="Regions: NZ-AUK,NZ-WKO" value={tripCountries} onChange={(e) => setTripCountries(e.target.value)} />
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
        <RegionKeyGuide trips={trips} />
      </section>

      <section className="card stack">
        <h2>3 · Backup and moving data</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Everything is stored only on this device. A backup is one open JSON file (entries, outings, voice notes and photos). Use “Import” on another device —
          for example your Mac or second phone — to merge it; nothing is overwritten silently.
        </p>
        <p className="muted small" style={{ margin: 0 }}>
          A backup holds every entry with its exact GPS position, notes, voice notes and photos: keep it private. A trip file holds only the active trip, for sharing with someone on the same trip.
        </p>
        <div className="muted small">
          Last backup: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : 'never'} · {settings.entriesSinceBackup} entries since
        </div>
        <div className="row wrap">
          <button className="btn primary" onClick={() => backup('backup')}>Save backup file</button>
          {settings.activeTripId && <button className="btn" onClick={() => backup('trip')}>Save trip file</button>}
          <button className="btn" onClick={doImport}>Import / merge a file</button>
        </div>
        {importMsg && <div className="small" role="status">{importMsg}</div>}
        <Conflicts />
      </section>

      <section className="card stack">
        <h2>4 · Preferences</h2>
        <label className="field">
          Device name (shown in backup files)
          <DraftField stored={settings.deviceName} onSave={(v) => updateSettings({ deviceName: v || 'Device' })} />
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
          <DraftField inputMode="numeric" stored={String(settings.defaultObservers)} onSave={(v) => updateSettings({ defaultObservers: Math.max(1, parseInt(v, 10) || 1) })} />
        </label>
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
