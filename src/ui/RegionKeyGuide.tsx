import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { Trip } from '../core/types';
import { db } from '../db';
import { downloadRegionList, updateSettings } from '../store';
import { DraftField } from './DraftField';
import { useOnline, useSettings } from './hooks';

/** The optional step that turns on unusual-bird warnings: get an eBird key, paste it, download the trip's lists. */
export function RegionKeyGuide({ trips }: { trips: Trip[] }) {
  const settings = useSettings();
  const online = useOnline();
  const lists = useLiveQuery(() => db.tripLists.toArray(), []) ?? [];
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const trip = trips.find((t) => t.id === settings?.activeTripId);
  const have = new Map(lists.map((l) => [l.key, l.codes.length]));
  const missing = trip?.countryCodes.filter((c) => !have.has(c)) ?? [];

  const download = async () => {
    setBusy(true);
    try {
      const counts = await Promise.all((trip?.countryCodes ?? []).map((c) => downloadRegionList(c, settings!.ebirdApiKey!)));
      setMsg(`Saved ${counts.reduce((a, b) => a + b, 0)} species. Unusual-bird warnings are on.`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const status = !trip?.countryCodes.length
    ? 'Off: create a trip with a region code above first.'
    : missing.length
      ? `Off: no species list yet for ${missing.join(', ')}.`
      : `On for ${trip.countryCodes.map((c) => `${c} (${have.get(c)} species)`).join(', ')}.`;

  return (
    <div className="stack">
      <h3>Warn about unusual birds (optional)</h3>
      <p className="muted small" style={{ margin: 0 }}>
        BirdTally can ask “are you sure?” before recording a bird that has never been reported in your trip’s region, so a slip of the finger is caught and a real rarity is
        flagged for a description. It needs your own free eBird key, set up once while online:
      </p>
      <ol className="small stack" style={{ margin: 0, paddingLeft: 20 }}>
        <li>Sign in at ebird.org (or create a free account).</li>
        <li>
          Open the <a href="https://ebird.org/api/keygen" target="_blank" rel="noreferrer">eBird key page</a>, fill in the short form and accept eBird’s terms. eBird then shows your key.
        </li>
        <li>Copy the key and paste it below. It is personal: don’t share it. It stays on this device, is sent only to eBird and is never put in backup files.</li>
        <li>Tap “Download lists for this trip”. Do this before you go offline; the warnings then work without a connection.</li>
      </ol>
      <DraftField className="text" type="password" placeholder="Your eBird key" aria-label="Your eBird key" stored={settings?.ebirdApiKey ?? ''} onSave={(v) => updateSettings({ ebirdApiKey: v.trim() || undefined })} />
      <button className="btn small" disabled={busy || !settings?.ebirdApiKey || !online || !trip?.countryCodes.length} onClick={download}>
        {busy ? 'Downloading…' : 'Download lists for this trip'}
      </button>
      {msg && <div className="small" role="status">{msg}</div>}
      <div className="small" role="status">Status: {status}</div>
      <div className="muted small">
        Species lists: <a href="https://ebird.org" target="_blank" rel="noreferrer">eBird.org</a>, for personal, non-commercial use under the{' '}
        <a href="https://www.birds.cornell.edu/home/ebird-api-terms-of-use/" target="_blank" rel="noreferrer">eBird API terms</a>. The lists show where a bird has ever been reported, so a
        warning means “unusual”, not “impossible”.
      </div>
    </div>
  );
}
