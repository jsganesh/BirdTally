import { mergeLocaleNames, parseEbirdTaxonomyCsv } from '../core/taxonomy';
import type { GeoBounds } from '../core/types';
import { db } from '../db';
import { updateSettings } from './settings';


// ---------- taxonomy (offline, downloaded before a trip) ----------

const API = 'https://api.ebird.org/v2';

export async function downloadTaxonomy(locales: string[], onProgress: (msg: string) => void) {
  onProgress('Checking latest taxonomy version…');
  const versions: { authorityVer: number; latest: boolean }[] = await fetch(`${API}/ref/taxonomy/versions`).then((r) => {
    if (!r.ok) throw new Error(`eBird returned ${r.status}`);
    return r.json();
  });
  const version = versions.find((v) => v.latest)?.authorityVer ?? 0;
  onProgress(`Downloading eBird taxonomy ${version} (English)…`);
  const en = await fetch(`${API}/ref/taxonomy/ebird?fmt=csv&locale=en&version=${version}`).then((r) => {
    if (!r.ok) throw new Error(`eBird returned ${r.status}`);
    return r.text();
  });
  const taxa = parseEbirdTaxonomyCsv(en);
  for (const l of locales.filter((x) => x !== 'en')) {
    onProgress(`Downloading names: ${l}…`);
    const csv = await fetch(`${API}/ref/taxonomy/ebird?fmt=csv&locale=${encodeURIComponent(l)}&version=${version}`).then((r) => {
      if (!r.ok) throw new Error(`eBird returned ${r.status} for locale ${l}`);
      return r.text();
    });
    mergeLocaleNames(taxa, l, csv);
  }
  await db.taxonomy.put({ key: 'current', version, locales: ['en', ...locales.filter((x) => x !== 'en')], downloadedAt: new Date().toISOString(), count: taxa.length, taxa });
  await updateSettings({ displayLocales: ['en', ...locales.filter((x) => x !== 'en')] });
  onProgress(`Saved ${taxa.length.toLocaleString()} taxa (version ${version}).`);
}

const KEY_REFUSED = 'eBird refused the key. Check that you copied all of it and nothing extra, and that it is the key from ebird.org/api/keygen (the Status and Trends key does not work here).';
const TIMEOUT_MS = 20_000;

/** A pasted or typed key without the spaces, line breaks and invisible characters phones add around it. */
export const cleanApiKey = (text: string) => text.replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, '');

/** An authenticated eBird GET. A request that never answers (weak mobile signal) becomes an error instead of waiting forever. */
async function ebirdGet(path: string, apiKey: string): Promise<Response> {
  try {
    return await fetch(`${API}${path}`, { headers: { 'x-ebirdapitoken': apiKey }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'TimeoutError') throw new Error('eBird did not answer in time. Check your connection and try again.');
    if (name === 'TypeError') throw new Error('Could not reach eBird. Check your connection and try again.');
    throw e;
  }
}

export interface RegionOption {
  code: string;
  name: string;
}

/** Sub-regions of `parent` ('world' lists the countries), for choosing a trip region. Needs the user's own eBird key. */
export async function listRegions(type: 'country' | 'subnational1', parent: string, apiKey: string): Promise<RegionOption[]> {
  const r = await ebirdGet(`/ref/region/list/${type}/${encodeURIComponent(parent)}`, apiKey);
  if (r.status === 403) throw new Error(KEY_REFUSED);
  if (!r.ok) throw new Error(`eBird returned ${r.status}`);
  const rows: unknown = await r.json();
  const ok = (x: unknown): x is RegionOption => typeof (x as RegionOption)?.code === 'string' && typeof (x as RegionOption)?.name === 'string';
  return (Array.isArray(rows) ? rows.filter(ok) : []).sort((a, b) => a.name.localeCompare(b.name));
}

const countriesByKey = new Map<string, Promise<RegionOption[]>>();

/**
 * The country list, fetched once per key and shared by everything that needs it (the picker, and the key check in
 * Setup). A failure is forgotten so that Retry asks again.
 */
export function listCountries(apiKey: string): Promise<RegionOption[]> {
  let p = countriesByKey.get(apiKey);
  if (!p) {
    p = listRegions('country', 'world', apiKey);
    countriesByKey.set(apiKey, p);
    p.catch(() => countriesByKey.delete(apiKey));
  }
  return p;
}

/** Optional: likely species for a region. Needs the user's own eBird API key. */
export async function downloadRegionList(region: string, apiKey: string) {
  const r = await ebirdGet(`/product/spplist/${encodeURIComponent(region)}`, apiKey);
  if (r.status === 403) throw new Error(KEY_REFUSED);
  if (r.status === 400 || r.status === 404) throw new Error(`eBird does not recognise the region code ${region}. Use a code like NZ or NZ-AUK.`);
  if (!r.ok) throw new Error(`eBird returned ${r.status}`);
  const codes: string[] = await r.json();
  const bounds = await fetchBounds(region, apiKey);
  await db.tripLists.put({ key: region.toUpperCase(), codes, downloadedAt: new Date().toISOString(), bounds });
  return codes.length;
}

/**
 * The region's bounding box for the GPS cross-check. A refusal or a missing box gives null (stop asking); a network
 * error gives undefined so it is tried again later. Either way the species list itself is still saved.
 */
async function fetchBounds(region: string, apiKey: string): Promise<GeoBounds | null | undefined> {
  try {
    const r = await ebirdGet(`/ref/region/info/${encodeURIComponent(region)}`, apiKey);
    if (!r.ok) return null;
    const b = (await r.json())?.bounds;
    const box = { minX: b?.minX, maxX: b?.maxX, minY: b?.minY, maxY: b?.maxY };
    return Object.values(box).every(Number.isFinite) ? box : null;
  } catch {
    return undefined;
  }
}
