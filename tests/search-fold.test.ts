// Common birds were buried under hybrids and "X/Y" entries ("goldfinch" showed 5 species, then 7 hybrids), and a
// 4-letter code that spells a word (MYNA, Paperbark Flycatcher) beat every myna.
import { describe, expect, it } from 'vitest';
import { buildIndex, searchTaxa, splitFolded } from '../src/core/taxonomy';
import type { Taxon } from '../src/core/types';

let order = 0;
const taxon = (code: string, en: string, category = 'species', codes: string[] = []): Taxon => ({ code, sci: en, en, category, order: ++order, codes, names: {} });
const taxa = [
  taxon('paperb1', 'Paperbark Flycatcher', 'species', ['MYNA']),
  taxon('mynsta1', 'myna/starling sp.', 'spuh'),
  taxon('commyn', 'Common Myna', 'species', ['COMY']),
  taxon('eurgol', 'European Goldfinch', 'species', ['EUGO']),
  taxon('x00001', 'European x American Goldfinch (hybrid)', 'hybrid'),
  taxon('y00001', 'European/Gray-crowned Goldfinch', 'slash'),
  taxon('amegfi', 'American Goldfinch', 'species', ['AMGO']),
  taxon('mallar3', 'Mallard', 'species', ['MALL']),
  taxon('mallar2', 'Mallard (Domestic type)', 'domestic')
];
const index = buildIndex(taxa, ['en']);
const split = (q: string) => splitFolded(searchTaxa(index, q, { limit: 40 }), q);
const names = (hits: { taxon: Taxon }[]) => hits.map((h) => h.taxon.en);

describe('folding hybrids, slashes, spuhs and domestic types', () => {
  it('shows species first and folds the rest', () => {
    const { main, folded } = split('goldfinch');
    expect(names(main)).toEqual(['European Goldfinch', 'American Goldfinch']);
    expect(names(folded)).toEqual(['European x American Goldfinch (hybrid)', 'European/Gray-crowned Goldfinch']);
    expect(names(split('mallard').folded)).toEqual(['Mallard (Domestic type)']);
  });

  it.each(['goldfinch x', 'european/', 'goldfinch hybrid', 'mallard domestic', 'myna sp'])('shows them directly when asked: %s', (q) => {
    expect(split(q).folded).toEqual([]);
  });

  it('shows them directly when nothing else matches', () => {
    expect(names(split('starling').main)).toEqual(['myna/starling sp.']);
  });
});

describe('a code that spells a word', () => {
  it('does not beat birds with that word in their name', () => {
    expect(split('myna').main[0].taxon.en).toBe('Common Myna');
  });

  it('still wins when no name has the word', () => {
    expect(split('eugo').main[0].taxon.en).toBe('European Goldfinch');
    expect(split('MALL').main[0].taxon.en).toBe('Mallard');
  });
});
