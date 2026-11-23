import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildIndex, displayNames, type SearchIndexEntry } from '../core/taxonomy';
import type { Taxon, TaxonomyInfo } from '../core/types';
import { db, type SettingsRow } from '../db';
import { getSettings } from '../store';

interface TaxonomyCtx {
  info?: TaxonomyInfo;
  taxa: Map<string, Taxon>;
  index: SearchIndexEntry[];
  loading: boolean;
}
const Ctx = createContext<TaxonomyCtx>({ taxa: new Map(), index: [], loading: true });

/** Loads the downloaded taxonomy once into memory and rebuilds when it changes. */
export function TaxonomyProvider({ children, locales }: { children: ReactNode; locales: string[] }) {
  const [state, setState] = useState<TaxonomyCtx>({ taxa: new Map(), index: [], loading: true });
  const stamp = useLiveQuery(() => db.taxonomy.get('current').then((t) => t?.downloadedAt ?? ''), [], undefined);
  const key = locales.join(',');
  useEffect(() => {
    if (stamp === undefined) return;
    let cancelled = false;
    db.taxonomy.get('current').then((t) => {
      if (cancelled) return;
      if (!t) return setState({ taxa: new Map(), index: [], loading: false });
      const { taxa, ...info } = t;
      setState({ info, taxa: new Map(taxa.map((x) => [x.code, x])), index: buildIndex(taxa, locales), loading: false });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, key]);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useTaxonomy = () => useContext(Ctx);

export function useSettings(): SettingsRow | undefined {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    getSettings().then(() => setReady(true));
  }, []);
  return useLiveQuery(() => (ready ? db.settings.get('main') : undefined), [ready]);
}

export function useOnline(): boolean {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}

/** Name helpers bound to the user's display languages. */
export function useNames() {
  const { taxa } = useTaxonomy();
  const settings = useSettings();
  const locales = settings?.displayLocales ?? ['en'];
  return useMemo(
    () => ({
      name(code?: string) {
        if (!code) return 'Identification pending';
        const t = taxa.get(code);
        return t ? t.en : code;
      },
      alt(code?: string) {
        if (!code) return '';
        const t = taxa.get(code);
        return t ? displayNames(t, locales).others.join(' · ') : '';
      },
      sci(code?: string) {
        return code ? (taxa.get(code)?.sci ?? '') : '';
      }
    }),
    [taxa, locales]
  );
}
