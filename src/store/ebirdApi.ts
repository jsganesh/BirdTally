import { mergeLocaleNames, parseEbirdTaxonomyCsv } from '../core/taxonomy';
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
  if (!r.ok) throw new Error(r.status === 403 ? 'eBird refused the API key.' : `eBird returned ${r.status}`);
  const codes: string[] = await r.json();
  await db.tripLists.put({ key: region.toUpperCase(), codes, downloadedAt: new Date().toISOString() });
  return codes.length;
}
