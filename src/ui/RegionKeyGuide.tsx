import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { missingRegions } from '../core/region';
import type { Trip } from '../core/types';
import { db } from '../db';
import { downloadRegionList, updateSettings } from '../store';
import { DraftField } from './DraftField';
import { useOnline, useSettings } from './hooks';

const STEPS = (
  <ol className="small stack" style={{ margin: 0, paddingLeft: 20 }}>
    <li>Sign in at ebird.org (or create a free account).</li>
    <li>
      Open the <a href="https://ebird.org/api/keygen" target="_blank" rel="noreferrer">eBird key page</a>, fill in the short form and accept eBird’s terms. eBird then shows your key.
    </li>
    <li>Copy the key and paste it below. It is personal: don’t share it. It stays on this device, is sent only to eBird and is never put in backup files.</li>
  </ol>
);

/**
 * The optional step that turns on unusual-bird warnings. The key is set up once; after that each trip
 * region needs only its list, which downloads by itself when the device is online.
 */
export function RegionKeyGuide({ trips }: { trips: Trip[] }) {
  const settings = useSettings();
  const online = useOnline();
  const lists = useLiveQuery(() => db.tripLists.toArray(), []) ?? [];
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const tried = useRef('');
  const key = settings?.ebirdApiKey;
  const trip = trips.find((t) => t.id === settings?.activeTripId);
  const regions = trip?.countryCodes ?? [];
  const missing = missingRegions(regions, lists.map((l) => l.key));

  const download = async (codes: string[]) => {
    setBusy(true);
    try {
      const counts = await Promise.all(codes.map((c) => downloadRegionList(c, key!)));
      setMsg(`Saved ${counts.reduce((a, b) => a + b, 0)} species for ${codes.join(', ')}. Unusual-bird warnings are on.`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Once per trip and set of missing regions, so a refused key or a bad code is not retried in a loop.
  useEffect(() => {
    const signature = `${trip?.id}:${missing.join()}`;
    if (!key || !online || !missing.length || busy || tried.current === signature) return;
    tried.current = signature;
    void download(missing);
  });

  const status = !regions.length ? 'Off: create a trip with a region code above first.' : missing.length ? `Off: no species list yet for ${missing.join(', ')}.` : `On for ${regions.join(', ')}.`;
  const saved = !!key && !changing;

  return (
    <div className="stack">
      <h3>Warn about unusual birds (optional)</h3>
      {saved ? (
        <div className="row">
          <span className="grow">✓ eBird key saved. It works for every trip.</span>
          <button className="btn small" onClick={() => setChanging(true)}>Change key</button>
        </div>
      ) : (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            BirdTally can ask “are you sure?” before recording a bird that has never been reported in your trip’s region, so a slip of the finger is caught and a real rarity is flagged
            for a description. It needs your own free eBird key, set up once while online. After that, each trip’s species list downloads by itself whenever you are online:
          </p>
          {STEPS}
          <DraftField className="text" type="password" placeholder="Your eBird key" aria-label="Your eBird key" stored={key ?? ''} onSave={(v) => updateSettings({ ebirdApiKey: v.trim() || undefined })} />
          {key && <button className="btn small" onClick={() => setChanging(false)}>Done</button>}
        </>
      )}
      {key && regions.length > 0 && (
        <button className="btn small" disabled={busy || !online} onClick={() => download(missing.length ? missing : regions)}>
          {busy ? 'Downloading…' : missing.length ? `Download list for ${missing.join(', ')}` : 'Update lists'}
        </button>
      )}
      {msg && <div className="small" role="status">{msg}</div>}
      <div className="small" role="status">Status: {status}{key && missing.length > 0 && !online ? ' It will download when you are online.' : ''}</div>
      <div className="muted small">
        Species lists: <a href="https://ebird.org" target="_blank" rel="noreferrer">eBird.org</a>, for personal, non-commercial use under the{' '}
        <a href="https://www.birds.cornell.edu/home/ebird-api-terms-of-use/" target="_blank" rel="noreferrer">eBird API terms</a>. The lists show where a bird has ever been reported, so a
        warning means “unusual”, not “impossible”.
      </div>
    </div>
  );
}
