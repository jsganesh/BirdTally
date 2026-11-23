import type { Taxon } from './types';

/** Lower-case, strip diacritics (Tūī → tui), turn punctuation into spaces. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** RFC-4180-style CSV parser (handles quoted fields with commas, quotes and newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

/** Split names like "Tūī | Tui" (eBird's mi locale) into separate names. */
function splitNames(s: string): string[] {
  return s
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);
}

function splitCodes(s: string): string[] {
  return s
    .split(/\s+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Parse the CSV from GET https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=csv&locale=…
 * The English (locale=en) file is the base: its COMMON_NAME is the name eBird import expects.
 */
export function parseEbirdTaxonomyCsv(text: string): Taxon[] {
  const rows = parseCsv(text);
  const header = rows[0];
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`eBird taxonomy file is missing the ${name} column`);
    return i;
  };
  const iSci = col('SCIENTIFIC_NAME');
  const iCom = col('COMMON_NAME');
  const iCode = col('SPECIES_CODE');
  const iCat = col('CATEGORY');
  const iOrder = col('TAXON_ORDER');
  const iComCodes = header.indexOf('COM_NAME_CODES');
  const iSciCodes = header.indexOf('SCI_NAME_CODES');
  const iBand = header.indexOf('BANDING_CODES');
  const iFam = header.indexOf('FAMILY_COM_NAME');
  const iReport = header.indexOf('REPORT_AS');
  const iExt = header.indexOf('EXTINCT');
  return rows.slice(1).map((r) => {
    const codes = new Set<string>();
    for (const i of [iComCodes, iSciCodes, iBand]) if (i >= 0 && r[i]) splitCodes(r[i]).forEach((c) => codes.add(c));
    return {
      code: r[iCode],
      sci: r[iSci],
      en: r[iCom],
      category: r[iCat],
      order: Number(r[iOrder]) || 0,
      family: iFam >= 0 ? r[iFam] || undefined : undefined,
      codes: [...codes],
      reportAs: iReport >= 0 ? r[iReport] || undefined : undefined,
      extinct: iExt >= 0 ? r[iExt] === 'true' || r[iExt] === '1' : undefined,
      names: {}
    };
  });
}

/** Read only SPECIES_CODE → COMMON_NAME from a locale file and attach to base taxa. */
export function mergeLocaleNames(base: Taxon[], locale: string, csv: string): number {
  const rows = parseCsv(csv);
  const header = rows[0];
  const iCode = header.indexOf('SPECIES_CODE');
  const iCom = header.indexOf('COMMON_NAME');
  const byCode = new Map(base.map((t) => [t.code, t]));
  let n = 0;
  for (const r of rows.slice(1)) {
    const t = byCode.get(r[iCode]);
    if (!t || !r[iCom]) continue;
    const names = splitNames(r[iCom]).filter((x) => x !== t.en);
    if (names.length) {
      t.names[locale] = names;
      n++;
    }
  }
  return n;
}

export interface SearchIndexEntry {
  taxon: Taxon;
  /** normalized English names (+ aliases) */
  names: string[];
  /** normalized names in the user's extra display languages (e.g. te reo Māori) */
  localNames: string[];
  codes: string[];
  sciNorm: string;
}

export function buildIndex(taxa: Taxon[], locales: string[]): SearchIndexEntry[] {
  return taxa.map((t) => {
    const en = [normalize(t.en)];
    // Common abbreviations birders type: "nz fantail" for New Zealand Fantail.
    const aliases = en.filter((n) => n.includes('new zealand')).map((n) => n.replace('new zealand', 'nz'));
    const local = locales.filter((l) => l !== 'en').flatMap((l) => t.names[l] ?? []).map(normalize);
    return { taxon: t, names: [...new Set([...en, ...aliases])], localNames: [...new Set(local)], codes: t.codes, sciNorm: normalize(t.sci) };
  });
}

export interface SearchHit {
  taxon: Taxon;
  score: number;
  matched: string;
}

const CATEGORY_BONUS: Record<string, number> = { species: 6, issf: 2, form: 1 };
/** Categories whose code lists include their parents' codes (e.g. a hybrid lists both). */
const COMPOSITE = new Set(['hybrid', 'slash', 'intergrade', 'spuh']);

function nameScore(n: string, q: string, tokens: string[]): number {
  if (n === q) return 90;
  if (n.startsWith(q)) return 80;
  const words = n.split(' ');
  if (tokens.every((tk) => words.some((w) => w.startsWith(tk)))) return tokens.length > 1 ? 72 : 70;
  if (q.length >= 3 && n.includes(q)) return 30;
  return 0;
}

/**
 * Rank taxa for a typed query.
 *  - Exact 4/6-letter codes ("TUI", "BASW", "HIRRUS") score high, but only for the taxon itself:
 *    hybrids and slashes also carry their parents' codes, so they score lower on a code match.
 *  - Names in the user's chosen extra languages get a bonus, so "piwa" finds Pīwakawaka before
 *    Pine Warbler (code PIWA) for someone who chose te reo Māori names.
 *  - Recently used and regional-list species are boosted.
 */
export function searchTaxa(
  index: SearchIndexEntry[],
  query: string,
  opts: { recent?: string[]; regional?: string[]; limit?: number } = {}
): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  const qCode = query.trim().toUpperCase();
  const tokens = q.split(' ');
  const recent = new Set(opts.recent ?? []);
  const regional = new Set(opts.regional ?? []);
  const hits: SearchHit[] = [];
  for (const e of index) {
    let score = 0;
    let matched = '';
    if (e.codes.includes(qCode)) {
      score = COMPOSITE.has(e.taxon.category) ? 50 : 85;
      matched = qCode;
    }
    for (const n of [...e.names, e.sciNorm]) {
      const s = nameScore(n, q, tokens);
      if (s > score) {
        score = s;
        matched = n;
      }
    }
    for (const n of e.localNames) {
      const s = nameScore(n, q, tokens);
      if (s && s + 10 > score) {
        score = s + 10;
        matched = n;
      }
    }
    if (score > 0) {
      score += CATEGORY_BONUS[e.taxon.category] ?? 0;
      if (recent.has(e.taxon.code)) score += 10;
      if (regional.has(e.taxon.code)) score += 8;
      if (e.taxon.extinct) score -= 20;
      hits.push({ taxon: e.taxon, score, matched });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.taxon.order - b.taxon.order);
  return hits.slice(0, opts.limit ?? 12);
}

/** Display name: English plus the first name in each extra display locale. */
export function displayNames(t: Taxon, locales: string[]): { primary: string; others: string[] } {
  const others = locales
    .filter((l) => l !== 'en')
    .map((l) => t.names[l]?.[0])
    .filter((x): x is string => !!x && x !== t.en);
  return { primary: t.en, others: [...new Set(others)] };
}
