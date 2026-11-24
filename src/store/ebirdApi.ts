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

/** Optional: likely species for a region. Needs the user's own eBird API key. */
export async function downloadRegionList(region: string, apiKey: string) {
  const r = await fetch(`${API}/product/spplist/${encodeURIComponent(region)}`, { headers: { 'x-ebirdapitoken': apiKey } });
  if (r.status === 403) throw new Error('eBird refused the key. Check that you copied all of it and that it is your own.');
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
    const r = await fetch(`${API}/ref/region/info/${encodeURIComponent(region)}`, { headers: { 'x-ebirdapitoken': apiKey } });
    if (!r.ok) return null;
    const b = (await r.json())?.bounds;
    const box = { minX: b?.minX, maxX: b?.maxX, minY: b?.minY, maxY: b?.maxY };
    return Object.values(box).every(Number.isFinite) ? box : null;
  } catch {
    return undefined;
  }
}
