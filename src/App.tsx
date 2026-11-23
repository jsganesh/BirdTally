import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db } from './db';
import { Checklists } from './ui/Checklists';
import { TaxonomyProvider, useOnline, useSettings } from './ui/hooks';
import { Notebook } from './ui/Notebook';
import { Setup } from './ui/Setup';
import { hashPin } from './ui/SetupControls';
import { Today } from './ui/Today';

type Tab = 'today' | 'notebook' | 'checklists' | 'setup';
const TABS: { id: Tab; label: string; ico: string }[] = [
  { id: 'today', label: 'Today', ico: '＋' },
  { id: 'notebook', label: 'Notebook', ico: '☰' },
  { id: 'checklists', label: 'Checklists', ico: '✓' },
  { id: 'setup', label: 'Setup', ico: '⚙' }
];

export function App() {
  const settings = useSettings();
  const online = useOnline();
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'today');
  const [unlocked, setUnlocked] = useState(false);
  const pending = useLiveQuery(() => db.sightings.filter((s) => !s.deleted && !s.speciesCode).count(), []) ?? 0;
  const toReview = useLiveQuery(() => db.outings.filter((o) => !o.deleted && (o.submission === 'draft' || o.submission === 'needs_correction')).count(), []) ?? 0;
  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW();

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`);
    window.scrollTo(0, 0);
  }, [tab]);
  useEffect(() => {
    const root = document.documentElement;
    if (!settings || settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings?.theme]);

  if (!settings) return null;
  if (settings.pinHash && !unlocked) return <Lock onUnlock={() => setUnlocked(true)} deviceId={settings.deviceId} pinHash={settings.pinHash} />;

  return (
    <TaxonomyProvider locales={settings.displayLocales}>
      <div className="app">
        <header className="topbar">
          <span className="brand grow">BirdTally</span>
          {settings.activeTripId && <TripName id={settings.activeTripId} />}
          <span className={`pill ${online ? 'online' : 'offline'}`} role="status">
            <span className="dot" aria-hidden />
            {online ? 'Online' : 'Offline — saving on device'}
          </span>
        </header>
        {needRefresh && (
          <div className="banner info" style={{ margin: '10px 16px 0' }}>
            <span className="grow">A new version of BirdTally is ready.</span>
            <button className="btn small" onClick={() => updateServiceWorker(true)}>Update</button>
          </div>
        )}
        <main>
          {tab === 'today' && <Today go={(t) => setTab(t as Tab)} />}
          {tab === 'notebook' && <Notebook />}
          {tab === 'checklists' && <Checklists />}
          {tab === 'setup' && <Setup />}
        </main>
        <nav className="tabs" aria-label="Main">
          {TABS.map((t) => {
            const n = t.id === 'notebook' ? pending : t.id === 'checklists' ? toReview : 0;
            return (
              <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                <span className={`ico ${n ? 'badge' : ''}`} data-n={n || undefined} aria-hidden>
                  {t.ico}
                </span>
                {t.label}
                {n ? <span className="visually-hidden"> ({n})</span> : null}
              </button>
            );
          })}
        </nav>
      </div>
    </TaxonomyProvider>
  );
}

function TripName({ id }: { id: string }) {
  const t = useLiveQuery(() => db.trips.get(id), [id]);
  return t ? <span className="pill">{t.name}</span> : null;
}

function Lock({ onUnlock, deviceId, pinHash }: { onUnlock: () => void; deviceId: string; pinHash: string }) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  return (
    <form
      className="lock"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await hashPin(pin, deviceId)) === pinHash) onUnlock();
        else {
          setWrong(true);
          setPin('');
        }
      }}
    >
      <h1>BirdTally</h1>
      <input autoFocus type="password" inputMode="numeric" aria-label="PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      {wrong && <div style={{ color: 'var(--error)' }}>Wrong PIN</div>}
      <button className="btn primary" style={{ width: 220 }}>Unlock</button>
    </form>
  );
}
