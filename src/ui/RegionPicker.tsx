import { useEffect, useRef, useState } from 'react';
import { listRegions, type RegionOption } from '../store';
import { useOnline, useSettings } from './hooks';

/** Choose a trip region from eBird's own lists instead of typing a code. Needs the saved key and a connection. */
export function RegionPicker({ onAdd }: { onAdd: (code: string) => void }) {
  const key = useSettings()?.ebirdApiKey;
  const online = useOnline();
  const [countries, setCountries] = useState<RegionOption[]>();
  const [areas, setAreas] = useState<RegionOption[]>([]);
  const [country, setCountry] = useState('');
  const [area, setArea] = useState('');
  const [error, setError] = useState('');
  const latest = useRef(0); // a slow answer for an earlier country must not overwrite a newer choice

  useEffect(() => {
    if (!key || !online || countries) return;
    listRegions('country', 'world', key).then(setCountries, (e: Error) => setError(e.message));
  }, [key, online, countries]);

  const chooseCountry = async (code: string) => {
    const mine = ++latest.current;
    setCountry(code);
    setArea('');
    setAreas([]);
    if (!code) return;
    try {
      const list = await listRegions('subnational1', code, key!);
      if (mine === latest.current) setAreas(list);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!key) return <p className="muted small" style={{ margin: 0 }}>Tip: save your eBird key (step below) to choose regions from a list instead of typing codes.</p>;
  if (!online) return <p className="muted small" style={{ margin: 0 }}>Connect to the internet to choose regions from a list, or type the codes.</p>;

  return (
    <div className="stack">
      <div className="row wrap">
        <select className="text grow" aria-label="Country" value={country} onChange={(e) => chooseCountry(e.target.value)}>
          <option value="">{countries ? 'Choose a country…' : 'Loading countries…'}</option>
          {countries?.map((c) => (
            <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
          ))}
        </select>
        {areas.length > 0 && (
          <select className="text grow" aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Whole country</option>
            {areas.map((a) => (
              <option key={a.code} value={a.code}>{a.name} ({a.code})</option>
            ))}
          </select>
        )}
        <button className="btn small" disabled={!country} onClick={() => onAdd(area || country)}>Add region</button>
      </div>
      {error && <div className="small" role="status">{error}</div>}
    </div>
  );
}
