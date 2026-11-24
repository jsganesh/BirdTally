import { useEffect, useState } from 'react';
import { listCountries, type RegionOption } from '../store';
import { useOnline, useSettings } from './hooks';

/**
 * Loads eBird's country list with the saved key. It doubles as the key check: a refused key is an error here, and an
 * error is shown as one, with a retry, rather than as an endless "Loading".
 */
export function useCountries() {
  const key = useSettings()?.ebirdApiKey;
  const online = useOnline();
  const [state, setState] = useState<{ countries?: RegionOption[]; error?: string }>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState({});
    if (!key || !online) return;
    let current = true;
    listCountries(key).then(
      (countries) => current && setState({ countries }),
      (e: Error) => current && setState({ error: e.message })
    );
    return () => {
      current = false;
    };
  }, [key, online, attempt]);

  return { key, online, ...state, retry: () => setAttempt((n) => n + 1) };
}
